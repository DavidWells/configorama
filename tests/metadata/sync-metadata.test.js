/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('sync API returns metadata when returnMetadata is true', () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = configorama.sync(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  // Should return object with config and metadata
  assert.ok(result.config, 'Should have config property')
  assert.ok(result.metadata, 'Should have metadata property')

  // Config should be resolved
  assert.is(result.config.stage, 'prod')
  assert.ok('region' in result.config, 'Should have region property')

  // Metadata should have expected structure
  assert.ok(result.metadata.variables, 'Should have variables')
  assert.ok(result.metadata.fileRefs, 'Should have fileRefs')
  assert.ok(result.metadata.summary, 'Should have summary')
  assert.ok(result.metadata.resolvedFileRefs, 'Should have resolvedFileRefs')
})

test('sync API metadata includes afterInnerResolution for nested variables', () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = configorama.sync(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { variables } = result.metadata

  // Find the nested file reference: ${file(./database-${self:stage}.json)}
  const fileVarKey = Object.keys(variables).find(k => k.includes('file(./database-${self:stage}.json)'))
  assert.ok(fileVarKey, 'Should find nested file variable')

  const fileVar = variables[fileVarKey][0]
  assert.ok(fileVar.resolveDetails, 'Should have resolveDetails')
  assert.ok(fileVar.resolveDetails.length > 1, 'Should have multiple resolveDetails for nested variable')

  // Check that outer variable has afterInnerResolution showing the path after inner vars resolved
  const fileDetail = fileVar.resolveDetails.find(d => d.varType && d.varType === 'file')
  assert.ok(fileDetail, 'Should find file varType detail')
  assert.ok(fileDetail.afterInnerResolution, 'Should have afterInnerResolution for file reference')
  assert.is(
    fileDetail.afterInnerResolution,
    'file(./database-prod.json)',
    'Should show file path after self:stage resolved to prod'
  )
})

test('sync API resolvedFileRefs contains actual file paths', () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = configorama.sync(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { metadata } = result

  // Should have resolvedFileRefs
  assert.ok(Array.isArray(metadata.resolvedFileRefs), 'Should have resolvedFileRefs array')

  // resolvedFileRefs should include the resolved path
  assert.ok(
    metadata.resolvedFileRefs.includes('./database-prod.json'),
    'resolvedFileRefs should include resolved path ./database-prod.json'
  )

  // Both should include the simple file reference
  assert.ok(
    metadata.resolvedFileRefs.includes('./database.json'),
    'resolvedFileRefs should include simple file reference'
  )
})

test.run()
