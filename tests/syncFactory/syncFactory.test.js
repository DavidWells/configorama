/* Tests for the syncFactory plugin contract in configorama.sync()
   Plugin factories rebuild real sources inside the sync-rpc worker */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const yamlFile = path.join(__dirname, 'syncFactory.yml')
const factoryPath = path.join(__dirname, 'mock-plugin-factory.js')

/**
 * Build the plugin-style source as the async API would hand it over.
 * match is a RegExp and resolver a function - neither survives the
 * JSON trip to the worker; syncFactory/syncOptions must carry the day.
 * @param {object} [syncOptions] - Options for the worker-side factory
 * @returns {object} Variable source
 */
function pluginSource(syncOptions = {}) {
  return {
    type: 'mock',
    match: /^mock:/,
    resolver: async () => 'never-called-in-sync',
    metadataKey: 'mockReferences',
    collectMetadata: () => [],
    syncFactory: factoryPath,
    syncOptions,
  }
}

test('sync resolves values through a syncFactory source', () => {
  const config = configorama.sync(yamlFile, {
    variableSources: [pluginSource()],
  })
  assert.is(config.value, 'resolved-hello')
  assert.is(config.other, 'resolved-world')
})

test('syncOptions round-trip to the worker factory as JSON', () => {
  const config = configorama.sync(yamlFile, {
    variableSources: [pluginSource({ suffix: '-sfx' })],
  })
  assert.is(config.value, 'resolved-hello-sfx')
})

test('returnMetadata surfaces plugin metadata from the worker', () => {
  const result = configorama.sync(yamlFile, {
    returnMetadata: true,
    variableSources: [pluginSource()],
  })
  assert.is(result.config.value, 'resolved-hello')
  assert.ok(Array.isArray(result.metadata.mockReferences))
  assert.is(result.metadata.mockReferences.length, 2)
  const raws = result.metadata.mockReferences.map((entry) => entry.raw).sort()
  assert.equal(raws, ['${mock:hello}', '${mock:world}'])
})

test('sources without syncFactory still require string descriptors', () => {
  try {
    configorama.sync(yamlFile, {
      variableSources: [{ type: 'mock', match: /^mock:/, resolver: async () => 'x' }],
    })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /must be string for .sync usage/)
  }
})

test('missing syncFactory file throws a clear error', () => {
  try {
    configorama.sync(yamlFile, {
      variableSources: [pluginSource() && { ...pluginSource(), syncFactory: path.join(__dirname, 'nope.js') }],
    })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Sync factory missing/)
  }
})

test.run()
