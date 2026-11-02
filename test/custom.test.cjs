const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.join(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const parse = require('../content/frontmatter.js')

test('YAML, BOM/CRLF, TOML and YAML end marker preserve metadata and body', () => {
  for (const [open, close, language, yaml] of [
    ['---', '---', 'yaml', 'name: work-weekly\ntitle: "Weekly"\ndescription: |\n  line one\n  line two'],
    ['---', '...', 'yaml', 'title: Weekly'],
    ['+++', '+++', 'toml', 'title = "Weekly"'],
  ]) {
    for (const newline of ['\n', '\r\n']) {
      const input = '\uFEFF' + [open, yaml, close, '# Body'].join('\n').replaceAll('\n', newline)
      const result = parse(input)
      assert.equal(result.body, '# Body')
      assert.equal(result.metadata.language, language)
      assert.equal(result.metadata.source, yaml.replaceAll('\n', newline))
      assert.equal(result.title, 'Weekly')
    }
  }
})

test('embedded delimiter text, empty and metadata-only documents', () => {
  assert.equal(parse('---\nname: a---b\n---\nBody').metadata.source, 'name: a---b')
  assert.equal(parse('---\nname: weekly\n---').body, '')
  assert.equal(parse('---\n---').metadata.source, '')
  assert.equal(parse('---\ntitle: |\n  multiline\n---').title, null)
})

test('ordinary, misplaced, unclosed and mismatched content is not discarded', () => {
  for (const input of ['', '# Hi', '---\nunfinished', '---\nname: a\n+++', 'Text\n---\nname: a\n---', '```yaml\n---\nname: a\n---\n```']) {
    assert.equal(parse(input).body, input)
    assert.equal(parse(input).metadata, null)
  }
})

function harness() {
  const body = {style: {}, innerText: '', classList: {remove() {}, add() {}, [Symbol.iterator]: function* () {}}}
  const context = {
    args: {theme: 'lapis-fzyousongjs', content: {frontmatter: true}, themes: {width: 'auto'}, custom: {}},
    document: {readyState: 'loading', querySelector: () => body, title: ''},
    chrome: {runtime: {onMessage: {addListener() {}}, getURL: x => x,
      sendMessage: (req, done) => { context.compiled = req.markdown; done({html: req.markdown ? '<h2 id="body">Body</h2>' : ''}) }}},
    setInterval() {}, clearInterval() {}, parseFrontmatter: parse,
    favicon() {},
    m: Object.assign((selector, ...children) => ({selector, children}), {
      redraw() {}, trust: html => ({trusted: html}), mount: (_, component) => { context.component = component }
    })
  }
  vm.createContext(context)
  vm.runInContext(read('content/index.js'), context)
  vm.runInContext('favicon = () => {}; mount()', context)
  return context
}

test('metadata bypasses compiler, renders as safe text, toggles and preserves Raw', () => {
  const h = harness()
  const text = '---\nname: <img src=x onerror=alert(1)>\n---\nBody'
  h.render(text)
  assert.equal(h.compiled, 'Body')
  let html = h.component.view().find(x => x.selector === '#_html')
  const details = html.children.find(x => x && x.selector === 'details._frontmatter')
  assert.equal(details.children[0].open, true)
  assert.equal(details.children[2].children[0].children[0], 'name: <img src=x onerror=alert(1)>')
  details.children[0].ontoggle({target: {open: false}})
  assert.equal(h.state.frontmatterOpen, false)
  h.state.content.frontmatter = false
  html = h.component.view().find(x => x.selector === '#_html')
  assert.ok(!html.children.some(x => x && x.selector === 'details._frontmatter'))
  h.state.raw = true
  assert.equal(h.component.view().find(x => x.selector === 'pre#_markdown').children[1], text)
  h.state.raw = false
  h.state.content.frontmatter = true
  h.render('---\nname: only-metadata\n---')
  assert.ok(h.component.view().some(x => x.selector === '#_html'))
  h.render('# Ordinary')
  assert.equal(h.state.frontmatter, null)
})

test('defaults and migrations keep only maintained themes and preserve opt-out', () => {
  const h = {md: {storage: {}}, chrome: {runtime: {getURL: x => x}}}
  vm.createContext(h)
  vm.runInContext(read('background/storage.js'), h)
  const compilers = {'markdown-it': {defaults: {}}, marked: {defaults: {}}, remark: {defaults: {}}}
  const state = h.md.storage.defaults(compilers)
  assert.equal(state.theme, 'lapis-fzyousongjs')
  assert.equal(state.content.frontmatter, true)
  state.theme = 'custom'
  delete state.content.frontmatter
  h.md.storage.migrations(state)
  assert.equal(state.theme, 'lapis-fzyousongjs')
  assert.equal(state.content.frontmatter, true)
  state.theme = 'purple-black-fzyousongjs'
  state.content.frontmatter = false
  h.md.storage.migrations(state)
  assert.equal(state.theme, 'purple-black-fzyousongjs')
  assert.equal(state.content.frontmatter, false)
})

test('both theme menus use only the four bundled themes with matching light styles', () => {
  const h = {
    document: {querySelector: () => null}, Settings() {}, Custom() {},
    chrome: {runtime: {sendMessage() {}}},
  }
  vm.createContext(h)
  vm.runInContext(read('popup/index.js'), h)
  const themes = Array.from(h.Popup().state._themes)
  assert.deepEqual(themes, ['lapis-fzyousongjs', 'github-fzyousongjs', 'purple-black-fzyousongjs', 'phycat-sky-fzyousongjs'])
  const content = harness()
  for (const theme of themes) {
    assert.ok(read('custom-themes/' + theme + '.css').includes('body._theme-' + theme))
    content.state.theme = theme
    content.render('# Body')
    const tree = content.component.view()
    assert.equal(content.state._themes[theme], 'light')
    assert.equal(tree.find(x => x.selector === '#_html').children[0].class, 'markdown-theme')
    assert.equal(tree.find(x => x.selector === 'link#_theme').children[0].href, '/themes/' + theme + '.css')
  }
})
