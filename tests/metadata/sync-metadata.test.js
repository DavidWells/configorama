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
  assert.ok(result.metadata.fileDependencies, 'Should have fileDependencies')
  assert.ok(result.metadata.summary, 'Should have summary')
  assert.ok(result.metadata.fileDependencies.resolved, 'Should have fileDependencies.resolved')
})

test('sync API metadata includes resolvedValue for nested variables', () => {
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

  // Check that inner variable has resolvedValue
  const selfStageDetail = fileVar.resolveDetails.find(d => d.variable === 'self:stage')
  assert.ok(selfStageDetail, 'Should find self:stage detail')
  assert.ok(selfStageDetail.resolvedValue, 'Should have resolvedValue')
  assert.is(selfStageDetail.resolvedValue, 'prod', 'self:stage should resolve to prod')

  // Check that outer variable has resolvedValue
  const fileDetail = fileVar.resolveDetails.find(d => d.varType && d.varType === 'file')
  assert.ok(fileDetail, 'Should find file varType detail')
  assert.ok(fileDetail.resolvedValue, 'Should have resolvedValue for file reference')
})

test('sync API fileDependencies.resolved contains actual file paths', () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = configorama.sync(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { metadata } = result

  // Should have fileDependencies.resolved
  assert.ok(Array.isArray(metadata.fileDependencies.resolved), 'Should have fileDependencies.resolved array')

  // resolved should include the resolved path
  assert.ok(
    metadata.fileDependencies.resolved.includes('./database-prod.json'),
    'fileDependencies.resolved should include resolved path ./database-prod.json'
  )

  // Should include the simple file reference
  assert.ok(
    metadata.fileDependencies.resolved.includes('./database.json'),
    'fileDependencies.resolved should include simple file reference'
  )
})

test.run()
