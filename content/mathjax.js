
var MathJax = {
  loader: {
    pathFilters: [
      ({name}) => name.startsWith('[tex]') ? false : true // keep the name
    ],
    require: async (path) => {
      if (!path.startsWith('[tex]')) return
      var res = await chrome.runtime.sendMessage({
        message: 'mathjax',
        extension: path.replace('[tex]/', '')
      })
      if (!res || res.error) throw new Error(res && res.error || 'Formula loader unavailable')
    }
  },
  tex: {
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)'],
    ],
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]'],
    ],
    processEscapes: true
  },
  showMathMenu: false,
  showProcessingMessages: false,
  messageStyle: 'none',
  skipStartupTypeset: true, // disable initial rendering
  positionToHash: false,
  options: {
    ignoreHtmlClass: 'tex2jax-ignore'
  },
  chtml: {
    fontURL: chrome.runtime.getURL('/vendor/mathjax/fonts')
  },
  startup: {
    typeset: false
  }
}

var mj = {
  loaded: false,
  render: async () => {
    mj.loaded = false
    try { await MathJax.typesetPromise() }
    catch (err) { console.warn('MathJax rendering failed:', err) }
    finally { mj.loaded = true }
  }
}
