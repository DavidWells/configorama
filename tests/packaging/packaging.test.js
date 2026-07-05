/* Tests root package exports and tarball contents for bundled plugins
   Uses Node package self-reference for exports and npm pack --dry-run for files */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { execFileSync } = require('child_process')

const rootDir = path.join(__dirname, '..', '..')

test('configorama/plugins/cloudformation resolves through package exports', () => {
  const factory = require('configorama/plugins/cloudformation')
  assert.type(factory, 'function')
})

test('configorama/plugins/onepassword resolves through package exports', () => {
  const factory = require('configorama/plugins/onepassword')
  assert.type(factory, 'function')
})

test('npm pack includes plugin entry points and excludes dev files', () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: rootDir, encoding: 'utf8' })
  const [result] = JSON.parse(output)
  const files = result.files.map((file) => file.path)

  assert.ok(files.includes('plugins/cloudformation/index.js'), 'cloudformation index published')
  assert.ok(files.includes('plugins/onepassword/index.js'), 'onepassword index published')
  assert.ok(files.includes('plugins/onepassword/sync-factory.js'), 'sync factory published')

  // npm-packlist force-includes lockfiles of nested package dirs, so
  // plugins/*/package-lock.json cannot be negated away - harmless to ship.
  const offenders = files.filter((file) => {
    return /^plugins\/.*\.test\.js$/.test(file)
      || /^plugins\/[^/]+\/example\//.test(file)
      || /node_modules/.test(file)
  })
  assert.equal(offenders, [])
})

test.run()
