
// chrome.storage.sync.clear()
// chrome.permissions.getAll((p) => chrome.permissions.remove({origins: p.origins}))

md.storage = ({compilers}) => {

  var defaults = md.storage.defaults(compilers)

  var state = {}

  async function set (options) {
    await chrome.storage.sync.set(options)
    Object.assign(state, options)
  }

  // Expose readiness so a cold service worker cannot handle tabs/messages
  // against empty settings. Register listeners synchronously; await this inside.
  var ready = new Promise((resolve, reject) => {
    chrome.storage.sync.get((res) => {
      try {
        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message)
        res = res || {}
        Object.assign(state, JSON.parse(JSON.stringify(defaults)), res)
        // Sync can contain incomplete/invalid values from older installations.
        // Keep an intentional empty origin map; only repair invalid containers.
        if (!state.origins || typeof state.origins !== 'object' || Array.isArray(state.origins)) {
          state.origins = JSON.parse(JSON.stringify(defaults.origins))
        }
        for (var origin of Object.keys(state.origins)) {
          var rule = state.origins[origin]
          if (!rule || typeof rule !== 'object' || Array.isArray(rule)) delete state.origins[origin]
        }
        if (!state.themes || typeof state.themes !== 'object') {
          state.themes = {...defaults.themes}
        }
        for (var key of ['content', 'settings', 'custom', ...Object.keys(compilers)]) {
          state[key] = Object.assign({}, defaults[key], res[key])
        }
        if (typeof state.theme !== 'string' && !(state.theme && typeof state.theme.name === 'string')) {
          state.theme = defaults.theme
        }
        if (!compilers[state.compiler]) state.compiler = defaults.compiler
        if (!['cursor', 'vscode', 'browser'].includes(state.editor)) state.editor = defaults.editor
        md.storage.migrations(state)
        // Persist migrations without racing subsequent user changes.
        set(state).then(() => { md.storage.bug(state); resolve() }, reject)
      }
      catch (err) { reject(err) }
    })
  })

  return {defaults, state, set, ready}
}

md.storage.defaults = (compilers) => {
  var match = '\\.(?:markdown|mdown|mkdn|md|mkd|mdwn|mdtxt|mdtext|text)(?:#.*|\\?.*)?$'

  var defaults = {
    theme: 'lapis-fzyousongjs',
    compiler: 'markdown-it',
    raw: false,
    editor: 'cursor',
    match,
    themes: {
      width: 'auto',
    },
    content: {
      autoreload: true,
      emoji: true,
      mathjax: true,
      mermaid: true,
      syntax: true,
      frontmatter: true,
      toc: false,
    },
    origins: {
      'file://': {
        header: true,
        path: true,
        match,
      }
    },
    settings: {
      icon: 'default',
      theme: 'light',
    },
    custom: {
      theme: '',
      color: 'auto',
    }
  }

  Object.keys(compilers).forEach((compiler) => {
    defaults[compiler] = compilers[compiler].defaults
  })

  return defaults
}

md.storage.bug = async (res) => {
  // Clean up stale optional hosts after reload, never manifest-required hosts.
  // On a fresh install storage is empty, but file:///* is already granted.
  try {
    var permissions = await chrome.permissions.getAll()
    var required = chrome.runtime.getManifest().host_permissions || []
    var origins = Object.keys(res.origins || {})
    var stale = permissions.origins.filter((origin) =>
      !required.includes(origin) && !origins.includes(origin.slice(0, -2)))
    if (stale.length) {
      await chrome.permissions.remove({origins: stale})
    }
  }
  catch (err) {
    console.warn('Could not clean up stale optional host permissions:', err)
  }
}

md.storage.migrations = (state) => {
  // v3.6 -> v3.7
  if (typeof state.origins['file://'] === 'object') {
    state.origins['file://'].csp = false
  }
  if (typeof state.theme === 'string') {
    state.theme = {
      name: state.theme,
      url: chrome.runtime.getURL(`/themes/${state.theme}.css`)
    }
  }
  if (state.themes === undefined) {
    state.themes = []
  }
  if (state.marked.tables !== undefined) {
    delete state.marked.tables
  }
  // v3.9 -> v4.0
  if (state.remark.commonmark !== undefined) {
    delete state.remark.commonmark
  }
  if (state.remark.pedantic !== undefined) {
    delete state.remark.pedantic
  }
  if (state.content.mermaid === undefined) {
    state.content.mermaid = false
  }
  if (state.themes === undefined || state.themes instanceof Array) {
    state.themes = {wide: false}
  }
  if (typeof state.theme === 'object') {
    state.theme = state.theme.name
  }
  // v4.0 -> v5.0
  Object.keys(state.origins).forEach((origin) => {
    state.origins[origin].csp = false
    state.origins[origin].encoding = ''
  })
  if (state.marked.smartLists !== undefined) {
    delete state.marked.smartLists
  }
  if (state.content.syntax === undefined) {
    state.content.syntax = true
  }
  if (state.themes.wide !== undefined) {
    if (state.themes.wide) {
      state.themes.width = 'full'
    }
    delete state.themes.wide
  }
  if (state.icon === undefined) {
    state.icon = false
  }
  if (state.remark.footnotes !== undefined) {
    delete state.remark.footnotes
  }
  // v5.0 -> v5.1
  if (state.header !== null) {
    Object.keys(state.origins).forEach((origin) => {
      state.origins[origin].header = true
      state.origins[origin].path = true
      delete state.origins[origin].csp
      delete state.origins[origin].encoding
    })
    state.header = null
  }
  if (state.content.scroll !== undefined) {
    delete state.content.scroll
  }
  if (state.settings === undefined) {
    state.settings = {
      icon: state.icon === true ? 'light' : 'dark',
      theme: 'light'
    }
  }
  // v5.1 -> v5.2
  if (state['markdown-it'].abbr === undefined) {
    Object.assign(state['markdown-it'], {
      abbr: false,
      attrs: false,
      cjk: false,
      deflist: false,
      footnote: false,
      ins: false,
      mark: false,
      sub: false,
      sup: false,
      tasklists: false,
    })

  }
  if (state.marked.linkify === undefined) {
    Object.assign(state.marked, {
      linkify: true,
    })
    delete state.marked.sanitize
  }
  // v5.2 -> v5.3
  if (state.custom === undefined) {
    state.custom = {
      theme: '',
      color: 'auto'
    }
  }
  // Custom edition: migrate hidden selections and preserve an explicit opt-out.
  if (!['lapis-fzyousongjs', 'github-fzyousongjs', 'purple-black-fzyousongjs', 'phycat-sky-fzyousongjs', 'cyanosis-fzyousongjs', 'claude-like-fzyousongjs'].includes(state.theme)) {
    state.theme = 'lapis-fzyousongjs'
  }
  if (state.content.frontmatter === undefined) {
    state.content.frontmatter = true
  }

}
