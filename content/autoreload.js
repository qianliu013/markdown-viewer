
;(() => {
  var current = typeof state.markdown === 'string' ? state.markdown : null
  var stopped = false
  var pending = false
  var stop = () => {
    stopped = true
    clearInterval(state.reload.interval)
  }

  var response = (md) => {
    if (current === null) current = md
    else if (current !== md) {
      state.reload.md = true
      current = md
      render(md)
    }
  }

  var xhr = new XMLHttpRequest()
  xhr.timeout = 10000
  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4) return
    pending = false
    // Network errors and HTTP error pages must not replace a readable document.
    if (!stopped && xhr.status >= 200 && xhr.status < 300) response(xhr.responseText)
  }
  xhr.onerror = xhr.ontimeout = xhr.onabort = () => { pending = false }

  var get = () => {
    if (stopped || pending) return
    pending = true
    if (location.protocol === 'file:') {
      try {
        chrome.runtime.sendMessage({
          message: 'autoreload', location: location.href
        }, (res) => {
          pending = false
          if (chrome.runtime.lastError || !res || res.error || res.err || typeof res.body !== 'string') {
            stop()
            return
          }
          if (!stopped) response(res.body)
        })
      }
      catch (err) {
        // Reloading the extension invalidates APIs in existing tabs. Keep the
        // displayed document and stop polling until the user refreshes the tab.
        pending = false
        stop()
      }
    }
    else {
      try {
        var url = new URL(location.href)
        url.hash = ''
        url.searchParams.set('preventCache', Date.now())
        xhr.open('GET', url.href, true)
        xhr.send()
      }
      catch (err) {
        pending = false
        stop()
      }
    }
  }

  get()
  if (!stopped) state.reload.interval = setInterval(get, state.reload.ms)
})()
