
var scroll = (() => {
  // Enhancements are optional: a failed formula/diagram must not hide prose
  // or leave polling timers running forever.
  function waitFor (check, limit = 2000) {
    return new Promise((resolve) => {
      var stop = () => { clearInterval(interval); clearTimeout(timeout); resolve() }
      var interval = setInterval(() => {
        try { if (check()) stop() } catch (err) { stop() }
      }, 50)
      var timeout = setTimeout(stop, limit)
    })
  }
  function onload (done) {
    Promise.all([
      waitFor(() => document.styleSheets.length),
      waitFor(() => Array.from(document.querySelectorAll('img')).every((img) => img.complete), 500),
      waitFor(() => !state.content.mermaid ||
        document.querySelectorAll('code.mermaid').length === document.querySelectorAll('code.mermaid svg').length),
      waitFor(() => !state.content.mathjax || mj.loaded),
    ]).then(done).catch(console.warn)
  }
  function listen (container, done) {
    var listener = /html|body/i.test(container.nodeName) ? window : container
    var timeout = null
    listener.addEventListener('scroll', () => {
      clearTimeout(timeout)
      timeout = setTimeout(done, 100)
    })
  }
  function get (container, prefix, offset) {
    var key = prefix + location.origin + location.pathname
    if (offset) {
      container.scrollTop = offset
      return
    }
    try {
      container.scrollTop = parseInt(localStorage.getItem(key))
    }
    catch (err) {
      chrome.storage.local.get(key, (res) => {
        if (chrome.runtime.lastError) return
        container.scrollTop = parseInt(res[key]) || 0
      })
    }
  }
  function set (container, prefix) {
    var key = prefix + location.origin + location.pathname
    listen(container, () => {
      try {
        localStorage.setItem(key, container.scrollTop)
      }
      catch (err) {
        chrome.storage.local.set({[key]: container.scrollTop})
      }
    })
  }
  var listening = false
  return (update) => {
    if ($('#_html')) $('#_html').style.visibility = 'visible'
    if ($('#_toc') && !state.raw) $('#_toc').style.visibility = 'visible'
    if ($('#_toc') && state.raw) $('#_toc').style.visibility = 'hidden'
    onload(() => {
      var container = ((html = $('html')) => (
        html.scrollTop = 1,
        html.scrollTop ? (html.scrollTop = 0, html) : $('body')
      ))()

      if (!update && location.hash && document.getElementById(location.hash.slice(1))) {
        get(container, 'md-', document.getElementById(location.hash.slice(1)).offsetTop)
      }
      else {
        get(container, 'md-')
      }

      if (state.content.toc && $('#_toc')) {
        setTimeout(() => get($('#_toc'), 'md-toc-'), 10)
      }

      if (!listening) {
        listening = true
        set(container, 'md-')
        if (state.content.toc && $('#_toc')) {
          setTimeout(() => set($('#_toc'), 'md-toc-'), 10)
        }
      }

      if ($('#_html')) $('#_html').style.visibility = 'visible'
      if ($('#_toc') && !state.raw) $('#_toc').style.visibility = 'visible'
    })
  }
})()
