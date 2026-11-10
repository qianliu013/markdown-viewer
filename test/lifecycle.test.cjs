const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.join(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r}); return {promise, resolve} }

// Execute the actual service-worker entry point and bundled compilers. Only the
// browser boundary (storage, messaging, permissions and injection) is simulated.
function worker() {
  const h = {console: {...console, error() {}}, URL, TextEncoder, TextDecoder, setTimeout: fn => { fn() }, clearTimeout() {}}
  const calls = []
  let readSettings
  let blockWrite
  const events = {}
  h.chrome = {
    runtime: {
      getURL: x => x, getManifest: () => JSON.parse(read('manifest.chrome.json')),
      onMessage: {addListener: cb => {events.message = cb}},
    },
    storage: {sync: {
      get: cb => {readSettings = cb},
      set: async value => {calls.push(['write', structuredClone(value)]); if (blockWrite) await blockWrite.promise},
    }},
    permissions: {getAll: async () => ({origins: ['file:///*']}), remove: async () => true},
    action: {setIcon() {}},
    tabs: {
      onUpdated: {addListener: cb => {events.tab = cb}},
      query: (_, cb) => cb([{id: 1}]),
      sendMessage: (_, req, cb) => {calls.push(['notify', req]); if (cb) cb()},
    },
    scripting: {
      executeScript: (options, cb) => {
        calls.push(['script', options])
        if (cb) cb([{result: JSON.stringify({url: 'file:///test.md', header: 'text/plain', loaded: false}), documentId: 'doc-1'}])
        return Promise.resolve([{result: true}])
      },
      insertCSS: async options => {calls.push(['css', options])},
    },
  }
  vm.createContext(h)
  h.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name.slice(1)), h, {filename: name}))
  vm.runInContext(read('background/index.js'), h)
  return {
    h, calls, events,
    start: data => readSettings(data),
    holdWrites: () => {blockWrite = deferred(); return blockWrite},
    message: (req, sender = {tab: {id: 1}}) => new Promise(resolve => events.message(req, sender, resolve)),
  }
}

test('cold worker registers listeners immediately but waits for settings before compiling or injecting', async () => {
  const w = worker()
  let replied = false
  const reply = w.message({message: 'markdown', markdown: '# Cold start'}).then(x => {replied = true; return x})
  w.events.tab(1, {status: 'loading'}, {})
  await tick()
  assert.equal(replied, false)
  assert.equal(w.calls.length, 0)
  w.start({})
  assert.match((await reply).html, /<h1.*Cold start/)
  await tick()
  const scriptCalls = w.calls.filter(x => x[0] === 'script')
  assert.equal(scriptCalls.length, 3)
  assert.deepEqual(Array.from(scriptCalls[1][1].target.documentIds), ['doc-1'])
})

test('saved partial settings are merged with defaults and actual compiler errors return a reply', async () => {
  const w = worker()
  w.start({theme: 'lapis-fzyousongjs', content: {syntax: false}})
  const popup = await w.message({message: 'popup'})
  assert.equal(popup.content.syntax, false)
  assert.equal(popup.content.frontmatter, true)
  for (const compiler of ['markdown-it', 'marked', 'remark']) {
    await w.message({message: 'popup.compiler.name', compiler})
    assert.match((await w.message({message: 'markdown', markdown: '# Hello'})).html, /Hello/)
  }
  await w.message({message: 'popup.compiler.name', compiler: 'markdown-it'})
  const bad = await w.message({message: 'markdown', markdown: null})
  assert.equal(typeof bad.error, 'string')
})

test('changing an option waits for persistence before reload and acknowledgement', async () => {
  const w = worker(); w.start({})
  await w.message({message: 'popup'})
  w.calls.length = 0
  const pending = w.holdWrites()
  let replied = false
  const reply = w.message({message: 'popup.content', content: {frontmatter: false}}).then(() => {replied = true})
  await tick()
  assert.equal(replied, false)
  assert.equal(w.calls.filter(x => x[0] === 'notify').length, 0)
  pending.resolve()
  await reply
  assert.equal(w.calls.filter(x => x[0] === 'notify').length, 1)
})

test('injection waits for args and CSS, targets one document and leaves source visible on failure', async () => {
  const setup = deferred(), css = deferred(), calls = [], warnings = []
  const page = {window: {}, document: {querySelector: () => ({style: {}})}}
  vm.createContext(page)
  const h = {md: {}, console: {warn: (...args) => warnings.push(args)}, chrome: {scripting: {
    executeScript: async options => {
      calls.push(options)
      if (options.args) {
        assert.equal(vm.runInContext('(' + options.func.toString() + ')({})', page), true)
        return setup.promise
      }
      if (options.files) throw new Error('injected dependency unavailable')
      vm.runInContext('(' + options.func.toString() + ')()', page)
      return []
    },
    insertCSS: () => {calls.push('css'); return css.promise},
  }}}
  vm.createContext(h); vm.runInContext(read('background/inject.js'), h)
  const run = h.md.inject({storage: {state: {content: {}, settings: {}}}})(1, 'doc-2')
  assert.equal(calls.length, 1)
  setup.resolve([{result: true}]); await tick()
  assert.equal(calls.length, 2)
  css.resolve(); await run
  assert.equal(warnings.length, 1)
  assert.equal(page.window.__markdownViewerLoading, undefined)
  assert.ok(calls.filter(x => x !== 'css').every(x => x.target.documentIds[0] === 'doc-2'))
})

test('broken diagrams/formulas cannot keep scroll restore polling forever', async () => {
  const intervals = new Map(), timeouts = new Map(); let id = 0
  const body = {nodeName: 'BODY', scrollTop: 0, addEventListener() {}}
  const h = {
    state: {raw: false, content: {mermaid: true, mathjax: true}}, mj: {loaded: false},
    document: {styleSheets: [], querySelectorAll: s => s === 'code.mermaid' ? [{}] : [], getElementById() {}},
    $: s => s === '#_toc' ? null : body,
    location: {hash: '', origin: 'file://', pathname: '/test.md'},
    localStorage: {getItem() {return '0'}}, window: {addEventListener() {}}, console,
    setInterval: cb => {intervals.set(++id, cb); return id}, clearInterval: id => intervals.delete(id),
    setTimeout: cb => {timeouts.set(++id, cb); return id}, clearTimeout: id => timeouts.delete(id),
  }
  vm.createContext(h); vm.runInContext(read('content/scroll.js'), h)
  h.scroll()
  for (const fn of [...timeouts.values()]) fn()
  await tick()
  assert.equal(intervals.size, 0)
})

test('auto reload recovers after a file is temporarily emptied while saving', () => {
  let poll
  const rendered = []
  const contents = ['original', '', 'restored']
  const h = {
    state: {reload: {ms: 1000}}, location: {protocol: 'file:', href: 'file:///test.md'},
    XMLHttpRequest: function () {}, console, clearInterval() {},
    setInterval: cb => {poll = cb},
    chrome: {runtime: {sendMessage: (_, done) => done({body: contents.shift()})}},
    render: text => rendered.push(text),
  }
  vm.createContext(h); vm.runInContext(read('content/autoreload.js'), h)
  poll(); poll()
  assert.deepEqual(rendered, ['', 'restored'])
})


test('invalid stored origins are repaired, intentional removals and disabled rules are preserved', async () => {
  for (const origins of [null, false, [], 'invalid']) {
    const w = worker(); w.start({origins, themes: null})
    const reply = await w.message({message: 'options.origins'})
    assert.ok(reply.origins && reply.origins['file://'])
    w.events.tab(1, {status: 'loading'}, {})
    await tick()
    assert.ok(w.calls.some(x => x[0] === 'css'))
  }
  for (const origins of [{}, {'file://': {header: false, path: false}}, {'https://invalid.test': null}]) {
    const w = worker(); w.start({origins})
    const reply = await w.message({message: 'options.origins'})
    assert.ok(!reply.error)
    w.events.tab(1, {status: 'loading'}, {})
    await tick()
    assert.equal(w.calls.filter(x => x[0] === 'css').length, 0)
  }
})

test('auto reload stops safely when extension messaging is invalidated or returns no response', () => {
  for (const mode of ['throw', 'missing', 'lastError']) {
    let poll, stopped = false, count = 0
    const h = {
      state: {reload: {ms: 1000}}, location: {protocol: 'file:', href: 'file:///test.md'},
      XMLHttpRequest: function () {}, console,
      clearInterval() {stopped = true}, setInterval: cb => {poll = cb; return 1},
      chrome: {runtime: {sendMessage: (_, done) => {
        if (++count === 1) return done({body: 'original'})
        if (mode === 'throw') throw new Error('Extension context invalidated.')
        if (mode === 'lastError') h.chrome.runtime.lastError = {message: 'Extension context invalidated.'}
        done()
      }}},
      render() {assert.fail('An unavailable response must not replace the displayed document')},
    }
    vm.createContext(h); vm.runInContext(read('content/autoreload.js'), h)
    assert.doesNotThrow(() => poll())
    assert.equal(stopped, true)
    poll()
    assert.equal(count, 2)
  }
})

test('scroll fallback tolerates a page whose extension context has been invalidated', async () => {
  const timers = [], intervals = [], listeners = []
  const body = {nodeName: 'BODY', scrollTop: 0, addEventListener: (_, cb) => listeners.push(cb)}
  const h = {
    state: {raw: false, content: {}},
    document: {styleSheets: [{}], querySelectorAll: () => [], getElementById() {}},
    $: s => s === '#_html' || s === '#_toc' ? null : body,
    location: {hash: '', origin: 'file://', pathname: '/test.md'},
    localStorage: {getItem() {throw Error('denied')}, setItem() {throw Error('denied')}},
    chrome: {storage: {local: {get() {throw Error('Extension context invalidated.')}, set() {throw Error('Extension context invalidated.')}}}},
    window: {addEventListener: (_, cb) => listeners.push(cb)},
    console: {warn: (...args) => {throw Error('Unexpected scroll failure: ' + args)}},
    setInterval: cb => {intervals.push(cb)}, clearInterval() {},
    setTimeout: cb => {timers.push(cb)}, clearTimeout() {},
  }
  vm.createContext(h); vm.runInContext(read('content/scroll.js'), h)
  h.scroll()
  for (const fn of intervals) fn()
  await tick()
  assert.equal(listeners.length, 1)
  listeners[0]()
  assert.doesNotThrow(() => timers.at(-1)())
})


test('deferred language and formula injection target their requesting document and report rejection', async () => {
  const w = worker(); w.start({})
  for (const message of ['prism', 'mathjax']) {
    const reply = await w.message({message, language: 'python', extension: 'color'}, {tab: {id: 1}, documentId: 'original-doc'})
    const script = w.calls.filter(x => x[0] === 'script').at(-1)[1]
    assert.deepEqual(Array.from(script.target.documentIds || []), ['original-doc'])
    assert.ok(reply)
  }
  w.h.chrome.scripting.executeScript = async () => {throw Error('Document was closed')}
  const reply = await w.message({message: 'prism', language: 'python'}, {tab: {id: 1}, documentId: 'closed-doc'})
  assert.match(reply.error, /Document was closed/)
})

test('Prism calls failure instead of success when its extension connection is lost', () => {
  for (const mode of ['throw', 'lastError', 'replyError', 'ok']) {
    let success = 0, failed = 0
    const h = {Prism: {plugins: {autoloader: {}}}, chrome: {runtime: {sendMessage: (_, done) => {
      if (mode === 'throw') throw Error('Extension context invalidated.')
      if (mode === 'lastError') h.chrome.runtime.lastError = {message: 'No receiver'}
      done(mode === 'replyError' ? {error: 'No document'} : [])
    }}}}
    vm.createContext(h); vm.runInContext(read('content/prism.js'), h)
    assert.doesNotThrow(() => h.Prism.plugins.autoloader.addScript('python', () => success++, () => failed++))
    assert.equal(success, mode === 'ok' ? 1 : 0)
    assert.equal(failed, mode === 'ok' ? 0 : 1)
  }
})

test('MathJax loader rejects messaging failures and synchronous typesetting failures settle', async () => {
  const h = {console: {warn() {}}, chrome: {runtime: {getURL: x => x, sendMessage: () => {throw Error('Extension context invalidated.')}}}}
  vm.createContext(h); vm.runInContext(read('content/mathjax.js'), h)
  await assert.rejects(async () => h.MathJax.loader.require('[tex]/color'), /invalidated/)
  h.chrome.runtime.sendMessage = async () => ({error: 'No document'})
  await assert.rejects(async () => h.MathJax.loader.require('[tex]/color'), /No document/)
  h.MathJax.typesetPromise = () => {throw Error('Not initialized')}
  await assert.doesNotReject(async () => h.mj.render())
  assert.equal(h.mj.loaded, true)
})

test('HTTP auto reload keeps the current document on failures and does not abort slow reads', () => {
  let xhr, poll, requests = 0
  const rendered = []
  const h = {
    URL, state: {markdown: 'original', reload: {ms: 1000}}, location: {protocol: 'https:', href: 'https://example.test/a.md?q=1#heading'},
    XMLHttpRequest: function () {xhr=this;this.open=(_,url)=>{this.url=url;requests++};this.send=()=>{}},
    setInterval: cb => {poll=cb}, clearInterval() {}, render: s => rendered.push(s), console,
  }
  vm.createContext(h); vm.runInContext(read('content/autoreload.js'), h)
  poll()
  assert.equal(requests, 1)
  const url = new URL(xhr.url)
  assert.equal(url.searchParams.get('q'), '1')
  assert.ok(url.searchParams.has('preventCache'))
  assert.equal(url.hash, '')
  xhr.readyState=4; xhr.status=500; xhr.responseText='server error'; xhr.onreadystatechange()
  assert.deepEqual(rendered, [])
  poll(); xhr.status=200; xhr.responseText='updated'; xhr.onreadystatechange()
  assert.deepEqual(rendered, ['updated'])
  poll(); xhr.status=0; xhr.responseText=''; xhr.onreadystatechange()
  assert.deepEqual(rendered, ['updated'])
})

test('file auto reload allows only one in-flight request and updates against displayed source', () => {
  let done, poll, requests=0
  const rendered=[]
  const h={state:{markdown:'original',reload:{ms:1000}}, location:{protocol:'file:',href:'file:///test.md'},
    XMLHttpRequest:function(){}, clearInterval(){}, setInterval:cb=>{poll=cb}, render:s=>rendered.push(s), console,
    chrome:{runtime:{sendMessage:(_,cb)=>{requests++;done=cb}}}}
  vm.createContext(h); vm.runInContext(read('content/autoreload.js'),h)
  poll(); assert.equal(requests,1)
  done({body:'new'}); assert.deepEqual(rendered,['new'])
  poll(); assert.equal(requests,2)
})

test('background fetch rejects HTTP failures and preserves existing query parameters', async () => {
  const urls=[]
  let status=404
  const h={md:{},URL,fetch:async url=>{urls.push(new URL(url)); return {ok:status===200,status,text:async()=> 'content'}}}
  vm.createContext(h); vm.runInContext(read('background/xhr.js'),h)
  const get=url=>new Promise(resolve=>h.md.xhr().get(url,(err,body)=>resolve({err,body})))
  const failure=await get('https://example.test/a.md?q=1#anchor')
  assert.ok(failure.err)
  assert.equal(failure.body,undefined)
  assert.equal(urls[0].searchParams.get('q'),'1')
  assert.ok(urls[0].searchParams.has('preventCache'))
  assert.equal(urls[0].hash,'')
  status=200
  assert.equal((await get('file:///test.md')).body,'content')
})

test('denied webRequest permission and tabs without content scripts do not throw', async () => {
  const timers=[]
  let listener
  const h={md:{},setTimeout:cb=>timers.push(cb),chrome:{runtime:{},permissions:{request:(_,cb)=>cb(false)},tabs:{sendMessage:(_,req,cb)=>{h.chrome.runtime.lastError={message:'No receiver'};cb()}}}}
  vm.createContext(h); vm.runInContext(read('background/webrequest.js'),h)
  const refresh=h.md.webrequest({storage:{state:{content:{autoreload:true}}}})
  assert.doesNotThrow(refresh)
  h.chrome.webRequest={onCompleted:{addListener:cb=>{listener=cb}}}
  h.md.webrequest({storage:{state:{content:{autoreload:true}}}})
  listener({ip:'1.2.3.4',tabId:1})
  assert.doesNotThrow(()=>timers[0]())
})


test('invalid legacy theme values do not prevent worker initialization', async () => {
  for (const theme of [null, {}, [], false]) {
    const w=worker(); w.start({theme})
    const reply=await w.message({message:'popup'})
    assert.equal(reply.theme,'lapis-fzyousongjs')
  }
})

test('invalid origin regex does not throw out of the asynchronous detection callback', async () => {
  const w=worker()
  w.start({header:null,origins:{'file://':{header:true,path:true,match:'['}}})
  await w.message({message:'popup'})
  // A true browser injection callback runs after detect.tab has returned.
  let detected
  w.h.chrome.scripting.executeScript=(_,cb)=>{detected=cb}
  w.events.tab(1,{status:'loading'},{})
  await tick()
  assert.doesNotThrow(()=>detected([{result:JSON.stringify({url:'file:///test.md',header:'text/plain',loaded:false})}]))
  assert.equal(w.calls.filter(x=>x[0]==='css').length,0)
})


test('editor preference defaults, persists before notification, and rejects unknown values', async () => {
  const w=worker(); w.start({})
  assert.equal((await w.message({message:'popup'})).editor,'cursor')
  const pending=w.holdWrites(); w.calls.length=0
  const change=w.message({message:'popup.editor',editor:'vscode'})
  await tick(); assert.equal(w.calls.filter(x=>x[0]==='notify').length,0)
  pending.resolve(); await change
  assert.equal((await w.message({message:'popup'})).editor,'vscode')
  assert.ok(w.calls.some(x=>x[0]==='notify' && x[1].editor==='vscode'))
  assert.ok((await w.message({message:'popup.editor',editor:'command'})).error)
  const restored=worker();restored.start({editor:'browser'})
  assert.equal((await restored.message({message:'popup'})).editor,'browser')
  const invalid=worker();invalid.start({editor:null})
  assert.equal((await invalid.message({message:'popup'})).editor,'cursor')
})

test('actual compilers preserve local code links; markdown-it allows file URLs only for local documents', async () => {
  const w=worker();w.start({})
  for (const compiler of ['markdown-it','marked','remark']) {
    await w.message({message:'popup.compiler.name',compiler})
    const reply=await w.message({message:'markdown',markdown:'[source](../src/a.wxml) [json](./data.json)'},{tab:{id:1},url:'file:///tmp/readme.md'})
    assert.match(reply.html,/href="..\/src\/a.wxml"/)
    assert.match(reply.html,/href=".\/data.json"/)
  }
  await w.message({message:'popup.compiler.name',compiler:'markdown-it'})
  const markdown='[source](file:///tmp/a.ts) [bad](javascript:alert%281%29)'
  const local=await w.message({message:'markdown',markdown},{tab:{id:1},url:'file:///tmp/readme.md'})
  assert.match(local.html,/href="file:\/\/\/tmp\/a.ts"/)
  assert.doesNotMatch(local.html,/href="javascript:/)
  const remote=await w.message({message:'markdown',markdown},{tab:{id:1},url:'https://example.com/readme.md'})
  assert.doesNotMatch(remote.html,/href="file:/)
})
