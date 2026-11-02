
importScripts('/vendor/markdown-it.min.js')
importScripts('/vendor/marked.min.js')
importScripts('/vendor/remark.min.js')
importScripts('/background/compilers/markdown-it.js')
importScripts('/background/compilers/marked.js')
importScripts('/background/compilers/remark.js')

importScripts('/background/storage.js')
importScripts('/background/webrequest.js')
importScripts('/background/detect.js')
importScripts('/background/inject.js')
importScripts('/background/messages.js')
importScripts('/background/mathjax.js')
importScripts('/background/xhr.js')
importScripts('/background/icon.js')

;(() => {
  var storage = md.storage(md)
  var inject = md.inject({storage})
  var detect = md.detect({storage, inject})
  var webrequest = md.webrequest({storage})
  var mathjax = md.mathjax()
  var xhr = md.xhr()
  var icon = md.icon({storage})

  var compilers = Object.keys(md.compilers)
    .reduce((all, compiler) => (
      all[compiler] = md.compilers[compiler]({storage}),
      all
    ), {})

  var messages = md.messages({storage, compilers, mathjax, xhr, webrequest, icon})

  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    storage.ready.then(() => detect.tab(id, info, tab)).catch(console.error)
  })
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    storage.ready.then(() => messages(req, sender, sendResponse)).catch((err) => {
      console.error(err)
      sendResponse({error: err.message})
    })
    return true
  })

  storage.ready.then(icon).catch(console.error)
})()
