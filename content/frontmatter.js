// Keep metadata verbatim; only complete, matching delimiter lines at the start count.
// No YAML evaluation is needed to display it safely.
var parseFrontmatter = (markdown) => {
  var match = /^\uFEFF?(---|\+\+\+)[ \t]*\r?\n([\s\S]*?)^(?:\1|(?<yamlEnd>\.\.\.))[ \t]*(?:\r?\n|$)/m.exec(markdown)
  if (!match || match.index !== 0 || (match.groups.yamlEnd && match[1] !== '---')) {
    return {body: markdown, metadata: null, title: null}
  }
  var language = match[1] === '---' ? 'yaml' : 'toml'
  var titleMatch = (language === 'yaml' ? /^title:[ \t]*(.+)$/m : /^title[ \t]*=[ \t]*(.+)$/m).exec(match[2])
  var title = titleMatch ? titleMatch[1].trim() : null
  if (title && /^(["'`]).*\1$/.test(title)) title = title.slice(1, -1)
  // Do not use block-scalar indicators as a browser title.
  if (title && /^[|>][+-]?\d?$/.test(title)) title = null
  return {
    body: markdown.slice(match[0].length),
    metadata: {language, source: match[2].replace(/\r?\n$/, '')},
    title,
  }
}

if (typeof module !== 'undefined') module.exports = parseFrontmatter
