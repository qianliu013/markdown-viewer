
md.xhr = () => {
  var get = async (url, done) => {
    var body
    try {
      var target = new URL(url)
      target.hash = ''
      target.searchParams.set('preventCache', Date.now())
      var res = await fetch(target.href)
      if (!res.ok) throw new Error(`Document request failed: HTTP ${res.status}`)
      body = await res.text()
    }
    catch (err) {
      done(err.message || String(err))
      return
    }
    done(null, body)
  }
  return {get}
}
