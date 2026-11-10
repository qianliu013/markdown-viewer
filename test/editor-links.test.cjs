
const {test} = require('node:test')
const assert = require('node:assert/strict')
const links = require('../content/editor-links.js')
const base = 'file:///Users/test/project/docs/readme.md'

test('all approved local code suffixes use the selected editor', () => {
  for (const suffix of ['js','jsx','ts','tsx','mjs','cjs','vue','svelte','css','scss','sass','less','wxss','wxml','wxs','xml','py','sh','java','kt','swift','go','rs','c','cpp','h']) {
    assert.equal(links.href('../src/a.'+suffix,base,'cursor'),'cursor://file/Users/test/project/src/a.'+suffix)
  }
  assert.equal(links.href('/tmp/A.TS',base,'vscode'),'vscode://file/tmp/A.TS')
  assert.equal(links.href('file:///tmp/a.wxml',base,'cursor'),'cursor://file/tmp/a.wxml')
})

test('JSON, Markdown, timeline, media and remote links keep their normal targets', () => {
  for (const target of ['data.json','data.jsonc','README.md','trace.timeline','trace.json.gz','trace.perfetto-trace','index.html','a.svg','a.png','a.pdf','https://example.com/a.ts','http://localhost/a.js','//server/share/a.ts','file://server/share/a.ts','cursor://file/tmp/a.ts','#a.ts','?next=a.ts','a.ts?download=1','javascript:alert(1)','data:text/plain,a.ts','a.ts.bak']) {
    assert.equal(links.href(target,base,'cursor'),null,target)
  }
  assert.equal(links.href('file:///tmp/a.ts','https://example.com/readme.md','cursor'),null)
  assert.equal(links.href('a.ts',base,'browser'),null)
  assert.equal(links.href('a.ts',base,'unknown'),null)
})

test('Chinese and reserved characters are encoded once and common line references survive', () => {
  assert.equal(links.href('../源代码/hello%20world.ts#L12C3',base,'cursor'),'cursor://file/Users/test/project/%E6%BA%90%E4%BB%A3%E7%A0%81/hello%20world.ts:12:3')
  assert.equal(links.href('/tmp/a%23b%25c.ts',base,'vscode'),'vscode://file/tmp/a%23b%25c.ts')
  assert.equal(links.href('../a.ts:12:3',base,'cursor'),'cursor://file/Users/test/project/a.ts:12:3')
  assert.equal(links.href('../a.ts#L12-L19',base,'cursor'),'cursor://file/Users/test/project/a.ts:12')
  for (const value of ['bad%XX.ts','a%00.ts','a%2fb.ts','a.ts#section','a.ts:0']) assert.equal(links.href(value,base,'cursor'),null)
})

function anchor(href, download=false) {
  return {value:href, hasAttribute:name=>name==='download' && download,
    getAttribute(){return this.value}, setAttribute(_,v){this.value=v}}
}

test('DOM rewriting is reversible, idempotent and leaves explicit downloads unchanged', () => {
  const a=anchor('../a.ts'), json=anchor('data.json'), remote=anchor('https://example.com/a.js'), download=anchor('file:///tmp/a.css',true)
  const root={querySelectorAll:()=>[a,json,remote,download]}
  links.update(root,base,'cursor'); links.update(root,base,'cursor')
  assert.equal(a.value,'cursor://file/Users/test/project/a.ts')
  links.update(root,base,'vscode'); assert.equal(a.value,'vscode://file/Users/test/project/a.ts')
  links.update(root,base,'browser'); assert.equal(a.value,'../a.ts')
  assert.equal(json.value,'data.json'); assert.equal(remote.value,'https://example.com/a.js'); assert.equal(download.value,'file:///tmp/a.css')
  links.update(null,base,'cursor')
})


test('popup exposes Cursor, VS Code and Browser and sends the selected preference', () => {
  const vm=require('node:vm'), fs=require('node:fs'), path=require('node:path')
  const sent=[]
  const h={localStorage:{getItem(){return null}}, document:{querySelector:s=>({classList:{add(){}}})},
    chrome:{runtime:{sendMessage:(req,done)=>{sent.push(req);if(req.message==='popup') done({compiler:'markdown-it',options:{},content:{},theme:'lapis-fzyousongjs',themes:{width:'auto'},editor:'cursor',raw:false,compilers:['markdown-it'],description:{},settings:{theme:'light'}})}}}}
  h.m=Object.assign((selector,...children)=>({selector,children}),{redraw(){},mount(){}})
  vm.createContext(h);vm.runInContext(fs.readFileSync(path.join(__dirname,'../popup/index.js'),'utf8'),h)
  const nodes=[]
  function walk(v){if(!v || typeof v!=='object')return;if(Array.isArray(v))return v.forEach(walk);nodes.push(v);if(v.children)v.children.forEach(walk)}
  walk(h.popup.render())
  const select=nodes.find(v=>v.selector?.startsWith('select') && v.children[0]?.title==='本地代码链接的打开方式')
  assert.ok(select)
  assert.deepEqual(Array.from(select.children[1],v=>v.children[0].value),['cursor','vscode','browser'])
  assert.equal(select.children[1][0].children[1],'代码链接：Cursor')
  select.children[0].onchange({target:{value:'vscode'}})
  assert.equal(sent.at(-1).message,'popup.editor');assert.equal(sent.at(-1).editor,'vscode')
})
