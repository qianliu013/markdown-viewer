const results = document.querySelector('#results')
const wait = async check => {
  for(let i=0;i<160;i++){ if(check()) return; await new Promise(r=>setTimeout(r,50)) }
  throw Error('Timed out waiting for browser state')
}
const assert = (condition, message) => {if(!condition) throw Error(message)}
const testCase = async (name, action) => {
  const item=document.createElement('li');item.textContent=name+' — running';results.append(item)
  try {await action();item.textContent=name+' — PASS';item.className='pass'}
  catch(error){item.textContent=name+' — FAIL: '+error.message;item.className='fail'}
}
const openFixture = async mode => {
  const frame=document.createElement('iframe');frame.src='/test/fixture.html?case='+mode
  document.querySelector('#preview').replaceChildren(frame)
  await new Promise(resolve=>frame.onload=resolve)
  return frame
}
const visible = (frame, selector) => {
  const el=frame.contentDocument.querySelector(selector)
  return el && frame.contentWindow.getComputedStyle(el).visibility==='visible'
}
document.querySelector('#run').onclick=async () => {
  document.querySelector('#run').disabled=true;results.replaceChildren()
  await testCase('Delayed compiler keeps source readable before revealing body',async()=>{
    const f=await openFixture('slow');await wait(()=>visible(f,'#_source'))
    assert(f.contentDocument.querySelector('#_source').textContent.includes('Reading body'),'source missing')
    await wait(()=>visible(f,'#_html h1'))
  })
  await testCase('Metadata escaping, collapse, Raw round-trip and four theme switches',async()=>{
    const f=await openFixture('normal');await wait(()=>visible(f,'#_html h1'))
    const w=f.contentWindow,d=f.contentDocument
    assert(!d.querySelector('details img'),'metadata executed as HTML')
    d.querySelector('summary').click();await wait(()=>!d.querySelector('details').open)
    w.deliver({message:'raw',raw:true});await wait(()=>!!d.querySelector('#_markdown'))
    assert(d.querySelector('#_markdown').textContent.includes('description:'),'Raw lost metadata')
    w.deliver({message:'raw',raw:false});await wait(()=>visible(f,'#_html h1'))
    assert(!d.querySelector('details').open,'collapse state lost')
    for(const theme of ['github','purple-black','phycat-sky','lapis']){
      w.deliver({message:'theme',theme:theme+'-fzyousongjs'})
      await wait(()=>d.querySelector('#_theme').getAttribute('href')==='/themes/'+theme+'-fzyousongjs.css' && !!d.querySelector('#_theme').sheet)
      assert(w.getComputedStyle(d.querySelector('#_html')).fontFamily.includes('FZYouSongJS'),'theme font missing')
      assert(visible(f,'#_html h1'),'switch hid body')
    }
  })
  for(const mode of ['metadata','empty','hidden']) await testCase(mode+' document renders',async()=>{
    const f=await openFixture(mode);await wait(()=>visible(f,'#_html'))
    assert(!!f.contentDocument.querySelector('details') === (mode==='metadata'),'unexpected metadata block')
  })
  await testCase('Compiler failure shows alert and complete original',async()=>{
    const f=await openFixture('error');await wait(()=>!!f.contentDocument.querySelector('#_render-error'))
    assert(f.contentDocument.querySelector('#_markdown').textContent.includes('description:'),'fallback lost source')
  })
  await testCase('Invalid Mermaid cannot block ordinary prose',async()=>{
    const f=await openFixture('diagram');await wait(()=>visible(f,'#_html h1'))
    assert(f.contentDocument.querySelector('#_html').textContent.includes('Visible paragraph'),'missing prose')
  })
  await testCase('Editor link DOM mapping and restoration (synthetic local base; no app launch)',async()=>{
    const f=await openFixture('links');await wait(()=>visible(f,'#_html h1'))
    const w=f.contentWindow,d=f.contentDocument,root=d.querySelector('#_html')
    const source=Array.from(root.querySelectorAll('a')).find(a=>a.textContent==='local source')
    assert(source.getAttribute('href')==='../src/a.wxml','HTTP document was rewritten')
    // Exercise actual DOM using a synthetic file URL, without reading local files.
    const base='file:///test/docs/readme.md'
    w.editorLinks.update(root,base,'cursor')
    assert(source.getAttribute('href')==='cursor://file/test/src/a.wxml','Cursor target incorrect')
    w.editorLinks.update(root,base,'vscode')
    assert(source.getAttribute('href')==='vscode://file/test/src/a.wxml','VS Code target incorrect')
    assert(root.querySelector('a[href="./data.json"]'),'JSON changed')
    assert(root.querySelector('a[href="https://example.com/a.ts"]'),'remote link changed')
    assert(Array.from(root.querySelectorAll('code')).some(c=>c.textContent==='src/plain.ts' && !c.closest('a')),'plain code became a link')
    w.editorLinks.update(root,base,'browser')
    assert(source.getAttribute('href')==='../src/a.wxml','original target lost')
  })
  document.querySelector('#run').disabled=false
}
