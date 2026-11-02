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
    message: req => new Promise(resolve => events.message(req, {tab: {id: 1}}, resolve)),
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

test('broken diagrams/formulas cannot keep the reading container hidden or poll forever', async () => {
  const intervals = new Map(), timeouts = new Map(); let id = 0
  const html = {style: {visibility: 'hidden'}}
  const body = {nodeName: 'BODY', scrollTop: 0, addEventListener() {}}
  const h = {
    state: {raw: false, content: {mermaid: true, mathjax: true}}, mj: {loaded: false},
    document: {styleSheets: [], querySelectorAll: s => s === 'code.mermaid' ? [{}] : [], getElementById() {}},
    $: s => s === '#_html' ? html : s === '#_toc' ? null : body,
    location: {hash: '', origin: 'file://', pathname: '/test.md'},
    localStorage: {getItem() {return '0'}}, window: {addEventListener() {}}, console,
    setInterval: cb => {intervals.set(++id, cb); return id}, clearInterval: id => intervals.delete(id),
    setTimeout: cb => {timeouts.set(++id, cb); return id}, clearTimeout: id => timeouts.delete(id),
  }
  vm.createContext(h); vm.runInContext(read('content/scroll.js'), h)
  h.scroll()
  assert.equal(html.style.visibility, 'visible')
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
