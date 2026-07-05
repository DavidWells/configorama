/* Sync e2e tests for the 1Password plugin through configorama.sync()
   Uses a fake op executable via opPath; the sync worker spawns it for real */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const createOnePasswordResolver = require('../../plugins/onepassword')

const yamlFile = path.join(__dirname, 'config.yml')
// opPath (not a PATH shim): sync-rpc spawns one worker per process at the
// first .sync() call anywhere in the suite, so PATH changes made in this
// file never reach an already-running worker. opPath is serializable and
// crosses the JSON boundary into the worker.
const fakeOpPath = path.join(__dirname, 'bin', 'op')

const refs = {
  npm: 'op://prod/npm/notesPlain',
  db: 'database-prod',
}

test('configorama.sync resolves op values through syncFactory', () => {
  const config = configorama.sync(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs, opPath: fakeOpPath })],
  })
  assert.is(config.token, 'npm_xxx')
  assert.is(config.dbPassword, 's3cr3t')
  assert.is(config.password, 'db-secret')
})

test('sync result equals async result for the same fake op', async () => {
  const syncConfig = configorama.sync(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs, opPath: fakeOpPath })],
  })
  const asyncConfig = await configorama(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs, opPath: fakeOpPath })],
  })
  assert.equal(syncConfig, asyncConfig)
})

test('sync returnMetadata surfaces opReferences from the worker', () => {
  const result = configorama.sync(yamlFile, {
    returnMetadata: true,
    variableSources: [createOnePasswordResolver({ refs, opPath: fakeOpPath })],
  })
  assert.is(result.config.token, 'npm_xxx')
  assert.ok(Array.isArray(result.metadata.opReferences))
  assert.is(result.metadata.opReferences.length, 3)
  const serialized = JSON.stringify(result.metadata.opReferences)
  assert.is(serialized.includes('npm_xxx'), false)
  assert.is(serialized.includes('db-secret'), false)
})

test('sync mode rejects injected execFile options', () => {
  const source = createOnePasswordResolver({ refs, execFile: () => {} })
  try {
    configorama.sync(yamlFile, { variableSources: [source] })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /not serializable for sync usage/)
  }
})

test.run()
