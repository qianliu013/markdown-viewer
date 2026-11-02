
md.inject = ({storage: {state}}) => async (id, documentId) => {

  var target = documentId ? {tabId: id, documentIds: [documentId]} : {tabId: id}
  try {
    var setup = await chrome.scripting.executeScript({
      target,
      args: [{
        theme: state.theme,
        raw: state.raw,
        themes: state.themes,
        content: state.content,
        compiler: state.compiler,
        custom: state.custom,
        icon: state.settings.icon,
      }],
      func: (_args) => {
        if (!document.querySelector('pre') || window.state || window.__markdownViewerLoading) return false
        window.__markdownViewerLoading = true
        args = _args
        return true
      },
      injectImmediately: true
    })

    if (!setup[0] || !setup[0].result) return
    await chrome.scripting.insertCSS({
      target,
      files: [
        '/content/index.css',
        '/content/themes.css',
      ]
    })

    await chrome.scripting.executeScript({
      target,
      files: [
        '/vendor/mithril.min.js',
        state.content.syntax && ['/vendor/prism.min.js', '/vendor/prism-autoloader.min.js', '/content/prism.js'],
        state.content.emoji && '/content/emoji.js',
        state.content.mermaid && ['/vendor/mermaid.min.js', '/vendor/panzoom.min.js', '/content/mermaid.js'],
        state.content.mathjax && ['/content/mathjax.js', '/vendor/mathjax/tex-mml-chtml.js'],
        '/content/frontmatter.js',
        '/content/scroll.js',
        '/content/index.js',
        state.content.autoreload && '/content/autoreload.js',
      ].filter(Boolean).flat(),
      injectImmediately: true
    })

  }
  catch (err) {
    console.warn('Markdown Viewer injection failed:', err)
    // Source was never hidden. Permit a later retry in this same document.
    await chrome.scripting.executeScript({target, func: () => {
      delete window.__markdownViewerLoading
    }}).catch(() => {}) // Document may already have closed or navigated.
  }
}
