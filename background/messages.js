
md.messages = ({storage: {defaults, state, set}, compilers, mathjax, xhr, webrequest, icon}) => {

  return async (req, sender, sendResponse) => {

    // content
    if (req.message === 'markdown') {
      var markdown = req.markdown

      if (state.content.mathjax) {
        var jax = mathjax()
        markdown = jax.tokenize(markdown)
      }

      var html = compilers[state.compiler].compile(markdown, {localFiles: !!sender.url && sender.url.startsWith('file:')})

      if (state.content.mathjax) {
        html = jax.detokenize(html)
      }

      sendResponse({message: 'html', html})
    }
    else if (req.message === 'autoreload') {
      xhr.get(req.location, (err, body) => {
        sendResponse({err, body})
      })
    }
    else if (req.message === 'prism' || req.message === 'mathjax') {
      // A delayed dependency belongs to the requesting document, not whichever
      // page the tab may have navigated to while the worker was waking up.
      var target = {tabId: sender.tab.id}
      if (sender.documentId) target.documentIds = [sender.documentId]
      var file = req.message === 'prism'
        ? `/vendor/prism/prism-${req.language}.min.js`
        : `/vendor/mathjax/extensions/${req.extension}.js`
      var result = await chrome.scripting.executeScript({
        target, files: [file], injectImmediately: true
      })
      sendResponse(result)
    }

    // popup
    else if (req.message === 'popup') {
      sendResponse(Object.assign({}, state, {
        options: state[state.compiler],
        description: compilers[state.compiler].description,
        compilers: Object.keys(compilers),
        themes: state.themes,
        settings: {theme: state.settings.theme}
      }))
    }
    else if (req.message === 'popup.theme') {
      await set({theme: req.theme})
      notifyContent({message: 'theme', theme: req.theme})
      sendResponse()
    }
    else if (req.message === 'popup.editor') {
      if (!['cursor', 'vscode', 'browser'].includes(req.editor)) throw new Error('Unknown editor')
      await set({editor: req.editor})
      notifyContent({message: 'editor', editor: req.editor})
      sendResponse()
    }
    else if (req.message === 'popup.raw') {
      await set({raw: req.raw})
      notifyContent({message: 'raw', raw: req.raw})
      sendResponse()
    }
    else if (req.message === 'popup.themes') {
      await set({themes: req.themes})
      notifyContent({message: 'themes', themes: req.themes})
      sendResponse()
    }
    else if (req.message === 'popup.defaults') {
      var options = JSON.parse(JSON.stringify(defaults))
      options.origins = state.origins
      await set(options)
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.name') {
      await set({compiler: req.compiler})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.options') {
      await set({[req.compiler]: req.options})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.content') {
      await set({content: req.content})
      notifyContent({message: 'reload'})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'popup.advanced') {
      // ff: opens up about:addons with openOptionsPage
      if (/Firefox/.test(navigator.userAgent)) {
        chrome.management.getSelf((extension) => {
          chrome.tabs.create({url: extension.optionsUrl})
        })
      }
      else {
        chrome.runtime.openOptionsPage()
      }
      sendResponse()
    }

    // origins view
    else if (req.message === 'options.origins') {
      sendResponse({
        origins: state.origins,
        match: state.match,
      })
    }
    // origins options
    else if (req.message === 'origin.add') {
      state.origins[req.origin] = {
        header: true,
        path: true,
        match: defaults.match,
      }
      await set({origins: state.origins})
      sendResponse()
    }
    else if (req.message === 'origin.remove') {
      delete state.origins[req.origin]
      await set({origins: state.origins})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'origin.update') {
      state.origins[req.origin] = req.options
      await set({origins: state.origins})
      webrequest()
      sendResponse()
    }

    // settings view
    else if (req.message === 'options.settings') {
      sendResponse(state.settings)
    }
    // settings options
    else if (req.message === 'options.icon') {
      await set({settings: req.settings})
      icon()
      sendResponse()
    }
    else if (req.message === 'options.theme') {
      await set({settings: req.settings})
      sendResponse()
    }
    else if (req.message === 'custom.get') {
      sendResponse(state.custom)
    }
    else if (req.message === 'custom.set') {
      set({custom: req.custom}).then(sendResponse).catch((err) => {
        if (/QUOTA_BYTES_PER_ITEM quota exceeded/.test(err.message)) {
          sendResponse({error: 'Minified theme exceeded 8KB in size!'})
        }
      })
    }

    return true
  }

  function notifyContent (req, res) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) return
      chrome.tabs.sendMessage(tabs[0].id, req, (response) => {
        // Active tab may be Settings or an ordinary page without our receiver.
        if (chrome.runtime.lastError) return
        if (res) res(response)
      })
    })
  }
}
