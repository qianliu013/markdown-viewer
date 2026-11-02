// Keep metadata verbatim; only complete, matching delimiter lines at the start count.
// No YAML evaluation is needed to display it safely.
var parseFrontmatter = (markdown) => {
  var opening = /^\uFEFF?(---|\+\+\+)[ \t]*\r?\n/.exec(markdown)
  if (!opening) return {body: markdown, metadata: null, title: null}
  var language = opening[1] === '---' ? 'yaml' : 'toml'
  var rest = markdown.slice(opening[0].length)
  var closing = (language === 'yaml' ? /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m : /^\+\+\+[ \t]*(?:\r?\n|$)/m).exec(rest)
  if (!closing) return {body: markdown, metadata: null, title: null}
  var metadata = rest.slice(0, closing.index)
  var titleMatch = (language === 'yaml' ? /^title:[ \t]*(.+)$/m : /^title[ \t]*=[ \t]*(.+)$/m).exec(metadata)
  var title = titleMatch ? titleMatch[1].trim() : null
  if (title && /^(["'`]).*\1$/.test(title)) title = title.slice(1, -1)
  // Do not use block-scalar indicators as a browser title.
  if (title && /^[|>][+-]?\d?$/.test(title)) title = null
  return {
    body: rest.slice(closing.index + closing[0].length),
    metadata: {language, source: metadata.replace(/\r?\n$/, '')},
    title,
  }
}

if (typeof module !== 'undefined') module.exports = parseFrontmatter
