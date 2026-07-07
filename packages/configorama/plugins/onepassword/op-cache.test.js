/* Integration tests for optional @davidwells/op-cache support.
   Uses a fake op binary and temp daemon sockets; never calls real 1Password. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const childProcess = require('child_process')
const Module = require('module')
const configorama = require('../../src')
const createOnePasswordResolver = require('./index')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-op-cache-'))
}

function fakeOp(dir) {
  const bin = path.join(dir, 'fake-op.js')
  const count = path.join(dir, 'count.txt')
  fs.writeFileSync(count, '0')
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
const count = ${JSON.stringify(count)}
const n = Number(fs.readFileSync(count, 'utf8') || '0') + 1
fs.writeFileSync(count, String(n))
const args = process.argv.slice(2)
if (process.env.FAKE_OP_FAIL) {
  process.stderr.write(process.env.FAKE_OP_FAIL)
  process.exit(1)
}
if (args[0] === 'read') {
  process.stdout.write(process.env.FAKE_OP_VALUE || 'cached-secret')
  process.exit(0)
}
if (args[0] === 'item') {
  process.stdout.write(JSON.stringify({
    id: args[2],
    title: args[2],
    fields: [{ id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'item-secret' }]
  }))
  process.exit(0)
}
process.stderr.write('unknown fake op command')
process.exit(1)
`)
  fs.chmodSync(bin, 0o755)
  return { bin, calls: () => Number(fs.readFileSync(count, 'utf8') || '0') }
}

function envFor(dir, fake) {
  return {
    ...process.env,
    OP_CACHE_SOCKET_PATH: path.join(dir, 'cache.sock'),
    OP_CACHE_OP_PATH: fake.bin,
    OP_CACHE_TTL_SECONDS: '2',
    OP_CACHE_MAX_TTL_SECONDS: '2',
    OP_CACHE_IDLE_EXIT_SECONDS: '1',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  }
}

function stop(env) {
  childProcess.spawnSync(process.execPath, [require.resolve('@davidwells/op-cache/src/cli'), 'stop'], { env, encoding: 'utf8' })
}

async function resolveWithCache(fake, cache) {
  const source = createOnePasswordResolver({ opPath: fake.bin, cache })
  return configorama({ token: '${op://vault/item/field}' }, { variableSources: [source] })
}

test('direct op:// refs use op-cache across separate processes when configured', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const code = `
const configorama = require('./src')
const createOnePasswordResolver = require('./plugins/onepassword')
configorama(
  { token: '\${op://vault/item/field}' },
  { variableSources: [createOnePasswordResolver({
    opPath: process.env.OP_CACHE_OP_PATH,
    cache: { provider: 'op-cache', ttlSeconds: 2, scope: 'session:cross-process' }
  })] }
).then((config) => process.stdout.write(config.token)).catch((err) => {
  process.stderr.write(err.stack || err.message)
  process.exit(1)
})
`
  try {
    const first = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(first.status, 0, first.stderr)
    assert.is(first.stdout, 'cached-secret')
    const second = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(second.status, 0, second.stderr)
    assert.is(second.stdout, 'cached-secret')
    assert.is(fake.calls(), 1)
  } finally {
    stop(env)
  }
})

test('no cache option preserves existing direct op behavior', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const source = createOnePasswordResolver({ opPath: fake.bin })
  const config = await configorama({ token: '${op://vault/item/field}' }, { variableSources: [source] })
  assert.is(config.token, 'cached-secret')
  assert.is(fake.calls(), 1)
})

test('item reads do not use op-cache daemon', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const prior = process.env.OP_CACHE_SOCKET_PATH
  const priorOp = process.env.OP_CACHE_OP_PATH
  process.env.OP_CACHE_SOCKET_PATH = env.OP_CACHE_SOCKET_PATH
  process.env.OP_CACHE_OP_PATH = fake.bin
  try {
    const source = createOnePasswordResolver({
      opPath: fake.bin,
      cache: { provider: 'op-cache', ttlSeconds: 2, scope: 'session:item-bypass' },
    })
    const config = await configorama({ password: '${op(database-prod).password}' }, { variableSources: [source] })
    assert.is(config.password, 'item-secret')
    assert.is(fake.calls(), 1)
    assert.is(fs.existsSync(env.OP_CACHE_SOCKET_PATH), false)
  } finally {
    if (prior === undefined) delete process.env.OP_CACHE_SOCKET_PATH
    else process.env.OP_CACHE_SOCKET_PATH = prior
    if (priorOp === undefined) delete process.env.OP_CACHE_OP_PATH
    else process.env.OP_CACHE_OP_PATH = priorOp
    stop(env)
  }
})

test('OP_SERVICE_ACCOUNT_TOKEN bypasses cache unless explicitly allowed', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const priorToken = process.env.OP_SERVICE_ACCOUNT_TOKEN
  const priorSocket = process.env.OP_CACHE_SOCKET_PATH
  process.env.OP_SERVICE_ACCOUNT_TOKEN = 'token-value'
  process.env.OP_CACHE_SOCKET_PATH = env.OP_CACHE_SOCKET_PATH
  try {
    await resolveWithCache(fake, { provider: 'op-cache', ttlSeconds: 2, scope: 'session:token' })
    await resolveWithCache(fake, { provider: 'op-cache', ttlSeconds: 2, scope: 'session:token' })
    assert.is(fake.calls(), 2)
  } finally {
    if (priorToken === undefined) delete process.env.OP_SERVICE_ACCOUNT_TOKEN
    else process.env.OP_SERVICE_ACCOUNT_TOKEN = priorToken
    if (priorSocket === undefined) delete process.env.OP_CACHE_SOCKET_PATH
    else process.env.OP_CACHE_SOCKET_PATH = priorSocket
    stop(env)
  }
})

test('cache failure fails closed by default and fallbackToOp degrades when enabled', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const badSocket = path.join(dir, 'not-a-socket')
  fs.writeFileSync(badSocket, 'x')
  const priorSocket = process.env.OP_CACHE_SOCKET_PATH
  process.env.OP_CACHE_SOCKET_PATH = badSocket
  try {
    try {
      await resolveWithCache(fake, { provider: 'op-cache', ttlSeconds: 2, scope: 'session:bad' })
      assert.unreachable('should fail closed')
    } catch (err) {
      assert.match(err.message, /Unsafe op-cache socket|failed to start|socket/)
    }
    const written = []
    const originalWrite = process.stderr.write
    process.stderr.write = (chunk) => { written.push(String(chunk)); return true }
    try {
      const config = await resolveWithCache(fake, { provider: 'op-cache', ttlSeconds: 2, scope: 'session:bad', fallbackToOp: true })
      assert.is(config.token, 'cached-secret')
    } finally {
      process.stderr.write = originalWrite
    }
    assert.ok(written.join('').includes('cache bypassed'))
  } finally {
    if (priorSocket === undefined) delete process.env.OP_CACHE_SOCKET_PATH
    else process.env.OP_CACHE_SOCKET_PATH = priorSocket
  }
})

test('missing op-cache package with cache configured gives install hint', () => {
  const originalLoad = Module._load
  Module._load = function patched(request) {
    if (request === '@davidwells/op-cache') {
      const err = new Error('Cannot find module')
      err.code = 'MODULE_NOT_FOUND'
      throw err
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    assert.throws(() => createOnePasswordResolver({ cache: { provider: 'op-cache' } }), /npm install @davidwells\/op-cache/)
  } finally {
    Module._load = originalLoad
  }
})

test.run()
