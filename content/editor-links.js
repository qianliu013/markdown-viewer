
// Only existing local source links are rewritten. No text scanning or file IO.
var editorLinks = (() => {
  var extensions = /\.(?:js|jsx|ts|tsx|mjs|cjs|vue|svelte|css|scss|sass|less|wxss|wxml|wxs|xml|py|sh|java|kt|swift|go|rs|c|cpp|h)$/i
  var original = new WeakMap()

  function href (value, base, editor) {
    if (!['cursor', 'vscode'].includes(editor) || !value || /^[#?]/.test(value.trim())) return null
    try {
      var page = new URL(base)
      if (page.protocol !== 'file:' || page.hostname) return null
      var target = new URL(value, page)
      if (target.protocol !== 'file:' || target.hostname || target.search) return null
      if (/%2f|%5c/i.test(target.pathname)) return null
      var path = decodeURIComponent(target.pathname)
      if (/[\u0000-\u001f\u007f]/.test(path)) return null
      var position = path.match(/:([1-9]\d*)(?::([1-9]\d*))?$/)
      if (position) path = path.slice(0, -position[0].length)
      if (!extensions.test(path)) return null
      var line = target.hash.match(/^#L([1-9]\d*)(?:C([1-9]\d*))?(?:-L[1-9]\d*)?$/)
      if (target.hash && !line) return null
      var suffix = line ? ':' + line[1] + (line[2] ? ':' + line[2] : '') : position ? position[0] : ''
      // Encode each component once, including Chinese, spaces, # and % in names.
      return editor + '://file' + path.split('/').map(encodeURIComponent).join('/') + suffix
    }
    catch (err) { return null }
  }

  function update (root, base, editor) {
    if (!root) return
    root.querySelectorAll('a[href]').forEach((link) => {
      if (link.hasAttribute('download')) return
      if (!original.has(link)) original.set(link, link.getAttribute('href'))
      var source = original.get(link)
      link.setAttribute('href', href(source, base, editor) || source)
    })
  }
  return {href, update}
})()
if (typeof module !== 'undefined') module.exports = editorLinks
