const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.join(__dirname, '..')

function harness(granted, failure) {
  const calls = []
  const warnings = []
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.chrome.json')))
  const context = {
    md: {}, console: {warn: (...args) => warnings.push(args)},
    chrome: {
      runtime: {getManifest: () => manifest},
      permissions: {
        getAll: callback => {
          const result = {origins: granted}
          if (callback) callback(result)
          return Promise.resolve(result)
        },
        remove: async ({origins}) => {
          calls.push(Array.from(origins))
          if (origins.some(origin => manifest.host_permissions.includes(origin))) {
            throw new Error('You cannot remove required permissions.')
          }
          if (failure) throw failure
          return true
        },
      },
    },
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(root, 'background/storage.js'), 'utf8'), context)
  return {cleanup: context.md.storage.bug, calls, warnings}
}

test('fresh install never tries to remove the required local-file permission', async () => {
  const h = harness(['file:///*'])
  await h.cleanup({})
  assert.deepEqual(h.calls, [])
  assert.deepEqual(h.warnings, [])
})

test('cleanup removes only stale optional hosts, retaining required and configured hosts', async () => {
  const h = harness(['file:///*', 'https://kept.example/*', 'https://stale.example/*'])
  await h.cleanup({origins: {'https://kept.example': {}}})
  assert.deepEqual(h.calls, [['https://stale.example/*']])
  assert.deepEqual(h.warnings, [])
})

test('permission API failures are handled without rejecting startup', async () => {
  const h = harness(['https://stale.example/*'], new Error('Permission API unavailable'))
  await h.cleanup({})
  assert.equal(h.warnings.length, 1)
  assert.match(h.warnings[0][1].message, /unavailable/)
})
