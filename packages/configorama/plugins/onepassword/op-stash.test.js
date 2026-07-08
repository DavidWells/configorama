/* Integration tests for optional @davidwells/op-stash support.
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-op-stash-'))
}

const LINK_ITEM_ID = 'abcdefghijklmnopqrstuvwxyz'
const INI_NOTE = 'NPM_TOKEN=npm-secret\n\n[database]\npassword=db-pass\n'

function fakeOp(dir) {
  const bin = path.join(dir, 'fake-op.js')
  const count = path.join(dir, 'count.txt')
  fs.writeFileSync(count, '')
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs')
// O_APPEND is atomic under concurrent op processes; a read-modify-write
// counter loses increments when resolution fans out in parallel.
fs.appendFileSync(${JSON.stringify(count)}, '.')
const args = process.argv.slice(2)
if (process.env.FAKE_OP_FAIL) {
  process.stderr.write(process.env.FAKE_OP_FAIL)
  process.exit(1)
}
if (args[0] === 'read') {
  const ref = args[2]
  if (ref && ref.endsWith('/notesPlain')) {
    process.stdout.write(${JSON.stringify(INI_NOTE)})
  } else {
    process.stdout.write(process.env.FAKE_OP_VALUE || 'cached-secret')
  }
  process.exit(0)
}
if (args[0] === 'item') {
  const id = args[2]
  const itemFields = {
    'note-item': [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: ${JSON.stringify(INI_NOTE)} }],
    'multi-section': [
      { id: 'f1', type: 'CONCEALED', label: 'apikey', section: { id: 's1', label: 'prod' }, value: 'prod-key' },
      { id: 'f2', type: 'CONCEALED', label: 'apikey', section: { id: 's2', label: 'staging' }, value: 'staging-key' },
    ],
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

// op-stash memoizes env-derived config per process; in-process daemon tests
// must reset it so each test's socket path takes effect.
const { resetConfigCache } = require('@davidwells/op-stash/src/config')

async function withCacheEnv(env, fn) {
  const priorSocket = process.env.OP_STASH_SOCKET_PATH
  const priorOp = process.env.OP_STASH_OP_PATH
  process.env.OP_STASH_SOCKET_PATH = env.OP_STASH_SOCKET_PATH
  process.env.OP_STASH_OP_PATH = env.OP_STASH_OP_PATH
  resetConfigCache()
  try {
    return await fn()
  } finally {
    if (priorSocket === undefined) delete process.env.OP_STASH_SOCKET_PATH
    else process.env.OP_STASH_SOCKET_PATH = priorSocket
    if (priorOp === undefined) delete process.env.OP_STASH_OP_PATH
    else process.env.OP_STASH_OP_PATH = priorOp
    resetConfigCache()
    stop(env)
  }
}

function envFor(dir, fake) {
  return {
    ...process.env,
    OP_STASH_SOCKET_PATH: path.join(dir, 'cache.sock'),
    OP_STASH_OP_PATH: fake.bin,
    OP_STASH_TTL_SECONDS: '2',
    OP_STASH_MAX_TTL_SECONDS: '2',
    OP_STASH_IDLE_EXIT_SECONDS: '1',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  }
}

function stop(env) {
  childProcess.spawnSync(process.execPath, [require.resolve('@davidwells/op-stash/src/cli'), 'stop'], { env, encoding: 'utf8' })
}

async function resolveWithCache(fake, cache) {
  const source = createOnePasswordResolver({ opPath: fake.bin, cache })
  return configorama({ token: '${op://vault/item/field}' }, { variableSources: [source] })
}

test('direct op:// refs use op-stash across separate processes when configured', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const code = `
const configorama = require('./src')
const createOnePasswordResolver = require('./plugins/onepassword')
configorama(
  { token: '\${op://vault/item/field}' },
  { variableSources: [createOnePasswordResolver({
    opPath: process.env.OP_STASH_OP_PATH,
    cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:cross-process' }
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

test('item reads use op-stash across separate resolver runs when configured', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const prior = process.env.OP_STASH_SOCKET_PATH
  const priorOp = process.env.OP_STASH_OP_PATH
  process.env.OP_STASH_SOCKET_PATH = env.OP_STASH_SOCKET_PATH
  process.env.OP_STASH_OP_PATH = fake.bin
  try {
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:item-cache' },
      })
      return configorama({ password: '${op(database-prod).password}' }, { variableSources: [source] })
    }
    const first = await resolveOnce()
    assert.is(first.password, 'item-secret')
    assert.is(fake.calls(), 1)
    // Fresh resolver = fresh in-process caches; only the daemon can satisfy this
    const second = await resolveOnce()
    assert.is(second.password, 'item-secret')
    assert.is(fake.calls(), 1)
  } finally {
    if (prior === undefined) delete process.env.OP_STASH_SOCKET_PATH
    else process.env.OP_STASH_SOCKET_PATH = prior
    if (priorOp === undefined) delete process.env.OP_STASH_OP_PATH
    else process.env.OP_STASH_OP_PATH = priorOp
    stop(env)
  }
})

test('OP_SERVICE_ACCOUNT_TOKEN bypasses cache unless explicitly allowed', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const priorToken = process.env.OP_SERVICE_ACCOUNT_TOKEN
  const priorSocket = process.env.OP_STASH_SOCKET_PATH
  process.env.OP_SERVICE_ACCOUNT_TOKEN = 'token-value'
  process.env.OP_STASH_SOCKET_PATH = env.OP_STASH_SOCKET_PATH
  try {
    await resolveWithCache(fake, { provider: 'op-stash', ttlSeconds: 2, scope: 'session:token' })
    await resolveWithCache(fake, { provider: 'op-stash', ttlSeconds: 2, scope: 'session:token' })
    assert.is(fake.calls(), 2)
  } finally {
    if (priorToken === undefined) delete process.env.OP_SERVICE_ACCOUNT_TOKEN
    else process.env.OP_SERVICE_ACCOUNT_TOKEN = priorToken
    if (priorSocket === undefined) delete process.env.OP_STASH_SOCKET_PATH
    else process.env.OP_STASH_SOCKET_PATH = priorSocket
    stop(env)
  }
})

test('cache failure fails closed by default and fallbackToOp degrades when enabled', () => {
  // op-stash resolves config once per process, so socket-path changes need
  // real process boundaries - same reason the cross-process test spawns.
  const dir = tempDir()
  const fake = fakeOp(dir)
  const badSocket = path.join(dir, 'not-a-socket')
  fs.writeFileSync(badSocket, 'x')
  const env = { ...envFor(dir, fake), OP_STASH_SOCKET_PATH: badSocket }
  const codeFor = (cacheJson) => `
const configorama = require('./src')
const createOnePasswordResolver = require('./plugins/onepassword')
configorama(
  { token: '\${op://vault/item/field}' },
  { variableSources: [createOnePasswordResolver({
    opPath: process.env.OP_STASH_OP_PATH,
    cache: ${cacheJson}
  })] }
).then((config) => process.stdout.write(config.token)).catch((err) => {
  process.stderr.write(err.message)
  process.exit(1)
})
`
  const closed = childProcess.spawnSync(process.execPath, ['-e', codeFor('{ provider: "op-stash", ttlSeconds: 2, scope: "session:bad" }')], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
  assert.is(closed.status, 1)
  assert.match(closed.stderr, /Unsafe op-stash socket|failed to start|socket/)
  const degraded = childProcess.spawnSync(process.execPath, ['-e', codeFor('{ provider: "op-stash", ttlSeconds: 2, scope: "session:bad", fallbackToOp: true }')], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
  assert.is(degraded.status, 0, degraded.stderr)
  assert.is(degraded.stdout, 'cached-secret')
  assert.ok(degraded.stderr.includes('cache bypassed'))
})

test('missing op-stash package with cache configured gives install hint', () => {
  const originalLoad = Module._load
  Module._load = function patched(request) {
    if (request === '@davidwells/op-stash') {
      const err = new Error('Cannot find module')
      err.code = 'MODULE_NOT_FOUND'
      throw err
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    assert.throws(() => createOnePasswordResolver({ cache: { provider: 'op-stash' } }), /npm install @davidwells\/op-stash/)
  } finally {
    Module._load = originalLoad
  }
})

test('alias to structured note key paths cache final values across fresh resolvers', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        refs: { npm: 'note-item' },
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:note-keys' },
      })
      return configorama(
        { token: '${op:npm.NPM_TOKEN}', dbPass: '${op:npm.database.password}' },
        { variableSources: [source] }
      )
    }
    const first = await resolveOnce()
    assert.is(first.token, 'npm-secret')
    assert.is(first.dbPass, 'db-pass')
    assert.is(fake.calls(), 1)
    const second = await resolveOnce()
    assert.is(second.token, 'npm-secret')
    assert.is(second.dbPass, 'db-pass')
    assert.is(fake.calls(), 1)
  })
})

test('direct item ID function syntax caches the final selected field', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:item-id' },
      })
      return configorama({ cred: `\${op(${LINK_ITEM_ID}).credential}` }, { variableSources: [source] })
    }
    assert.is((await resolveOnce()).cred, 'link-secret')
    assert.is((await resolveOnce()).cred, 'link-secret')
    assert.is(fake.calls(), 1)
  })
})

test('private link syntax caches and never exposes the raw URL', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const link = `https://start.1password.com/open/i?a=ACCOUNT&v=vaultid123&i=${LINK_ITEM_ID}&h=my.1password.com`
  await withCacheEnv(env, async () => {
    const sources = []
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:link' },
      })
      sources.push(source)
      return configorama({ cred: `\${op(${link}).credential}` }, { variableSources: [source] })
    }
    assert.is((await resolveOnce()).cred, 'link-secret')
    assert.is((await resolveOnce()).cred, 'link-secret')
    assert.is(fake.calls(), 1)
    for (const source of sources) {
      const serialized = JSON.stringify(source.collectMetadata())
      assert.not.match(serialized, /start\.1password\.com|ACCOUNT|my\.1password\.com/)
    }
  })
})

test('object refs cache per section', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        refs: {
          prodKey: { item: 'multi-section', section: 'prod', field: 'apikey' },
          stagingKey: { item: 'multi-section', section: 'staging', field: 'apikey' },
        },
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:sections' },
      })
      return configorama(
        { prod: '${op:prodKey}', staging: '${op:stagingKey}' },
        { variableSources: [source] }
      )
    }
    const first = await resolveOnce()
    assert.is(first.prod, 'prod-key')
    assert.is(first.staging, 'staging-key')
    assert.is(fake.calls(), 1)
    const second = await resolveOnce()
    assert.is(second.prod, 'prod-key')
    assert.is(second.staging, 'staging-key')
    assert.is(fake.calls(), 1)
  })
})

test('direct op:// with key path caches the final key value', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:ref-key' },
      })
      return configorama({ token: '${op(op://vault/item/notesPlain).NPM_TOKEN}' }, { variableSources: [source] })
    }
    assert.is((await resolveOnce()).token, 'npm-secret')
    assert.is((await resolveOnce()).token, 'npm-secret')
    assert.is(fake.calls(), 1)
  })
})

test('opReferences metadata is identical between miss and hit runs', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const resolveOnce = async () => {
      const source = createOnePasswordResolver({
        refs: { db: 'database-prod' },
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:meta' },
      })
      await configorama({ password: '${op:db}' }, { variableSources: [source] })
      return source.collectMetadata()
    }
    const missRun = await resolveOnce()
    assert.is(fake.calls(), 1)
    const hitRun = await resolveOnce()
    assert.is(fake.calls(), 1)
    // Inferred field name survives the cache hit via the envelope
    assert.is(missRun[0].field, 'password')
    assert.equal(hitRun, missRun)
  })
})

test('corrupted cache entries are recomputed and overwritten', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const opStashApi = require('@davidwells/op-stash')
  const { buildCacheRef } = require('./cache-ref')
  await withCacheEnv(env, async () => {
    const reference = { kind: 'item', item: 'database-prod', vault: undefined, section: undefined, field: undefined }
    const cacheRef = buildCacheRef(reference, 'password')
    // Seed a non-envelope entry under the exact key the resolver will use
    await opStashApi.getOrSet(cacheRef, async () => 'raw-not-an-envelope', {
      opPath: fake.bin,
      scope: 'session:corrupt',
      ttlSeconds: 2,
    })
    const resolveOnce = () => {
      const source = createOnePasswordResolver({
        opPath: fake.bin,
        cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:corrupt' },
      })
      return configorama({ password: '${op(database-prod).password}' }, { variableSources: [source] })
    }
    // The rejection warning is expected output - capture and assert it
    const written = []
    const originalWrite = process.stderr.write
    process.stderr.write = (chunk) => { written.push(String(chunk)); return true }
    let first
    try {
      first = await resolveOnce()
    } finally {
      process.stderr.write = originalWrite
    }
    assert.is(first.password, 'item-secret')
    assert.is(fake.calls(), 1)
    assert.ok(written.join('').includes('failed validation'))
    // Overwrite proven: the next fresh resolver hits the repaired entry
    const second = await resolveOnce()
    assert.is(second.password, 'item-secret')
    assert.is(fake.calls(), 1)
  })
})

test('OP_STASH_DISABLED=1 bypasses item syntax caching entirely', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const priorDisabled = process.env.OP_STASH_DISABLED
  process.env.OP_STASH_DISABLED = '1'
  try {
    await withCacheEnv(env, async () => {
      const resolveOnce = () => {
        const source = createOnePasswordResolver({
          opPath: fake.bin,
          cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:disabled' },
        })
        return configorama({ password: '${op(database-prod).password}' }, { variableSources: [source] })
      }
      assert.is((await resolveOnce()).password, 'item-secret')
      assert.is((await resolveOnce()).password, 'item-secret')
      assert.is(fake.calls(), 2)
      assert.is(fs.existsSync(env.OP_STASH_SOCKET_PATH), false)
    })
  } finally {
    if (priorDisabled === undefined) delete process.env.OP_STASH_DISABLED
    else process.env.OP_STASH_DISABLED = priorDisabled
  }
})

test('service account token bypasses item syntax caching unless allowed', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const priorToken = process.env.OP_SERVICE_ACCOUNT_TOKEN
  process.env.OP_SERVICE_ACCOUNT_TOKEN = 'token-value'
  try {
    await withCacheEnv(env, async () => {
      const resolveOnce = () => {
        const source = createOnePasswordResolver({
          opPath: fake.bin,
          cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:token-item' },
        })
        return configorama({ password: '${op(database-prod).password}' }, { variableSources: [source] })
      }
      assert.is((await resolveOnce()).password, 'item-secret')
      assert.is((await resolveOnce()).password, 'item-secret')
      assert.is(fake.calls(), 2)
      assert.is(fs.existsSync(env.OP_STASH_SOCKET_PATH), false)
    })
  } finally {
    if (priorToken === undefined) delete process.env.OP_SERVICE_ACCOUNT_TOKEN
    else process.env.OP_SERVICE_ACCOUNT_TOKEN = priorToken
  }
})

test('duplicate refs in one config share one op call through the promise cache', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  await withCacheEnv(env, async () => {
    const source = createOnePasswordResolver({
      opPath: fake.bin,
      cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:dupes' },
    })
    const config = await configorama(
      { a: '${op(database-prod).password}', b: '${op(database-prod).password}' },
      { variableSources: [source] }
    )
    assert.is(config.a, 'item-secret')
    assert.is(config.b, 'item-secret')
    assert.is(fake.calls(), 1)
  })
})

test('sync worker path caches item reads across separate processes', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = envFor(dir, fake)
  const code = `
const configorama = require('./src')
const createOnePasswordResolver = require('./plugins/onepassword')
const source = createOnePasswordResolver({
  opPath: process.env.OP_STASH_OP_PATH,
  cache: { provider: 'op-stash', ttlSeconds: 2, scope: 'session:sync-worker' }
})
const config = configorama.sync({ password: '\${op(database-prod).password}' }, { variableSources: [source] })
process.stdout.write(config.password)
`
  try {
    const first = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(first.status, 0, first.stderr)
    assert.is(first.stdout, 'item-secret')
    assert.is(fake.calls(), 1)
    const second = childProcess.spawnSync(process.execPath, ['-e', code], { cwd: __dirname + '/../..', env, encoding: 'utf8' })
    assert.is(second.status, 0, second.stderr)
    assert.is(second.stdout, 'item-secret')
    assert.is(fake.calls(), 1)
  } finally {
    stop(env)
  }
})

test('unknown cache provider fails loudly instead of silently skipping the cache', () => {
  assert.throws(
    () => createOnePasswordResolver({ cache: { provider: 'op-cache' } }),
    /Unknown 1Password cache provider "op-cache"/
  )
})

test.run()

