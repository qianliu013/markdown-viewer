
Prism.plugins.autoloader.addScript = (language, done, failed) => {
  var fail = () => { if (failed) failed() }
  try {
    chrome.runtime.sendMessage({message: 'prism', language}, (res) => {
      if (chrome.runtime.lastError || !res || res.error) fail()
      else done()
    })
  }
  catch (err) { fail() } // Existing pages may outlive the extension context.
}
