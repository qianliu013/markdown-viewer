const fixtureMode = new URLSearchParams(location.search).get('case') || 'normal'
const original = fixtureMode === 'empty' ? '' : fixtureMode === 'metadata' ? '---\nname: metadata-only\n---' :
  '---\nname: reading-fixture\ndescription: <img src=x onerror=alert(1)>\n---\n# Reading body\n\nVisible paragraph.\n\n| Object | Status |\n| --- | --- |\n| Document | Ready |'
document.querySelector('pre').textContent = original
if (fixtureMode === 'links') document.querySelector('pre').textContent += '\n\n[local source](../src/a.wxml) [data](./data.json) [remote source](https://example.com/a.ts) `src/plain.ts`'
var args = {theme:'lapis-fzyousongjs',raw:false,themes:{width:'auto'},content:{frontmatter:fixtureMode !== 'hidden',syntax:true,mermaid:fixtureMode === 'diagram'},custom:{},icon:'default'}
if (fixtureMode === 'diagram') document.querySelector('pre').textContent += '\n\n```mermaid\ninvalid diagram definition\n```'
window.addEventListener('load', async () => {
  const load = src => new Promise((resolve,reject) => {
    const s=document.createElement('script'); s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)
  })
  await load('/vendor/markdown-it.min.js'); await load('/background/compilers/markdown-it.js')
  const compiler=md.compilers['markdown-it']({storage:{state:{'markdown-it':md.compilers['markdown-it'].defaults}}})
  window.chrome={runtime:{onMessage:{addListener: f => {window.deliver=f}},getURL:x=>x,sendMessage:(req,done)=>{
    if (req.message === 'prism') {load('/vendor/prism/prism-'+req.language+'.min.js').then(() => done([]), () => done({error:'Language unavailable'})); return}
    setTimeout(()=>done(fixtureMode === 'error' ? {error:'Intentional test failure'} : {html:compiler.compile(req.markdown)}), fixtureMode==='slow'?700:150)
  }}}
  const scripts = ['/vendor/mithril.min.js','/vendor/prism.min.js','/vendor/prism-autoloader.min.js','/content/prism.js']
  if(args.content.mermaid) scripts.push('/vendor/mermaid.min.js','/vendor/panzoom.min.js','/content/mermaid.js')
  scripts.push('/content/editor-links.js')
  scripts.push('/content/frontmatter.js','/content/scroll.js','/content/index.js')
  for(const script of scripts) await load(script)
})
