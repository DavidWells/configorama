/* Sync e2e tests for the 1Password plugin through configorama.sync()
   Uses a fake op executable on PATH; the sync worker spawns it for real */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const createOnePasswordResolver = require('../../plugins/onepassword')

const yamlFile = path.join(__dirname, 'config.yml')
const fakeBinDir = path.join(__dirname, 'bin')
const originalPath = process.env.PATH

const refs = {
  npm: 'op://prod/npm/notesPlain',
  db: 'database-prod',
}

test.before(() => {
  process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`
})

test.after(() => {
  process.env.PATH = originalPath
})

test('configorama.sync resolves op values through syncFactory', () => {
  const config = configorama.sync(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs })],
  })
  assert.is(config.token, 'npm_xxx')
  assert.is(config.dbPassword, 's3cr3t')
  assert.is(config.password, 'db-secret')
})

test('sync result equals async result for the same fake op', async () => {
  const syncConfig = configorama.sync(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs })],
  })
  const asyncConfig = await configorama(yamlFile, {
    variableSources: [createOnePasswordResolver({ refs })],
  })
  assert.equal(syncConfig, asyncConfig)
})

test('sync returnMetadata surfaces opReferences from the worker', () => {
  const result = configorama.sync(yamlFile, {
    returnMetadata: true,
    variableSources: [createOnePasswordResolver({ refs })],
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
