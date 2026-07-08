/* Cross-process prompt-reduction regression: all four syntax families resolve
   with zero op invocations in a second process. Fake op only; never real 1Password. */

// Real manual QA (real 1Password is manual-only, never in CI):
//   op-stash stop
//   configx .env -- node <script>   # may prompt
//   configx .env -- node <script>   # should not prompt within TTL
//   op-stash stats --json           # shows entries and hits
//   op-stash stop
// OP_STASH_DISABLED=1 restores the old prompt-every-run behavior.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const childProcess = require('child_process')

const LINK_ITEM_ID = 'abcdefghijklmnopqrstuvwxyz'
const INI_NOTE = 'NPM_TOKEN=npm-secret\n\n[database]\npassword=db-pass\n'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-op-regression-'))
}

function fakeOp(dir) {
  const bin = path.join(dir, 'fake-op.js')
  const count = path.join(dir, 'count.txt')
  fs.writeFileSync(count, '')
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
// Concurrent op processes increment in parallel; O_APPEND is atomic where
// read-modify-write of a counter is not.
fs.appendFileSync(${JSON.stringify(count)}, '.')
const args = process.argv.slice(2)
if (args[0] === 'read') {
  process.stdout.write('direct-secret')
  process.exit(0)
}
if (args[0] === 'item') {
  const id = args[2]
  const itemFields = {
    'note-item': [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: ${JSON.stringify(INI_NOTE)} }],
    ${JSON.stringify(LINK_ITEM_ID)}: [{ id: 'credential', type: 'CONCEALED', label: 'credential', value: 'link-secret' }],
  }
  const fields = itemFields[id] || [{ id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'item-secret' }]
  process.stdout.write(JSON.stringify({ id, title: id, fields }))
  process.exit(0)
}
process.stderr.write('unknown fake op command')
process.exit(1)
`)
  fs.chmodSync(bin, 0o755)
  return { bin, calls: () => fs.readFileSync(count, 'utf8').length }
}

test('second process resolves every syntax family with zero op invocations', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = {
    ...process.env,
    OP_STASH_SOCKET_PATH: path.join(dir, 'cache.sock'),
    OP_STASH_OP_PATH: fake.bin,
    OP_STASH_TTL_SECONDS: '30',
    OP_STASH_MAX_TTL_SECONDS: '30',
    OP_STASH_IDLE_EXIT_SECONDS: '10',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  }
  delete env.OP_STASH_DISABLED
  delete env.OP_SERVICE_ACCOUNT_TOKEN
  const link = `https://start.1password.com/open/i?a=ACCOUNT&v=vaultid123&i=${LINK_ITEM_ID}&h=my.1password.com`
  const code = `
const configorama = require('./src')
const createOnePasswordResolver = require('./plugins/onepassword')
const source = createOnePasswordResolver({
  refs: { npm: 'note-item' },
  opPath: process.env.OP_STASH_OP_PATH,
  cache: { provider: 'op-stash', ttlSeconds: 30, scope: 'session:regression' }
})
configorama({
  a: '\${op:npm.NPM_TOKEN}',
  b: '\${op(database-prod).password}',
  c: '\${op(${link}).credential}',
  d: '\${op(op://vault/item/field)}'
}, { variableSources: [source] }).then((config) => {
  process.stdout.write(JSON.stringify(config))
}).catch((err) => {
  process.stderr.write(err.stack || err.message)
  process.exit(1)
})
`
  const expected = { a: 'npm-secret', b: 'item-secret', c: 'link-secret', d: 'direct-secret' }
  try {
    const first = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(first.status, 0, first.stderr)
    // stdout is exactly the resolved config - no cache chatter
    assert.equal(JSON.parse(first.stdout), expected)
    // one op invocation per distinct backing operation: two item gets, one
    // private-link item get, one op read
    assert.is(fake.calls(), 4)

    const second = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(second.status, 0, second.stderr)
    assert.equal(JSON.parse(second.stdout), expected)
    assert.is(fake.calls(), 4)

    const stats = childProcess.spawnSync(
      process.execPath,
      [require.resolve('@davidwells/op-stash/src/cli'), 'stats', '--json'],
      { env, encoding: 'utf8' }
    )
    assert.is(stats.status, 0, stats.stderr)
    const parsed = JSON.parse(stats.stdout)
    assert.is(parsed.entries, 4)
    assert.ok(parsed.hits >= 4, `expected >=4 hits, saw ${parsed.hits}`)
  } finally {
    childProcess.spawnSync(process.execPath, [require.resolve('@davidwells/op-stash/src/cli'), 'stop'], { env, encoding: 'utf8' })
  }
})

test.run()
