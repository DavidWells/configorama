/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { deepLog } = require('../utils')
const configorama = require('../../src')

test('Nested file references', async () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  deepLog('result', result)

  // Should return object with config and metadata
  assert.ok(result.config, 'Should have config property')
  assert.ok(result.metadata, 'Should have metadata property')

  // Config should be resolved
  assert.is(result.config.stage, 'prod')
  // Note: region might be empty if AWS_REGION env var is set to empty string
  assert.ok('region' in result.config, 'Should have region property')

  // Metadata should have expected structure
  assert.ok(result.metadata.variables, 'Should have variables')
  assert.ok(result.metadata.fileRefs, 'Should have fileRefs')
  assert.ok(result.metadata.summary, 'Should have summary')
})


test('returnMetadata returns both config and metadata', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })
  deepLog('result.metadata', result.metadata)
  deepLog('result.resolutionHistory', result.resolutionHistory)

  // deepLog('result.resolutionHistory[provider.stage]', result.resolutionHistory['provider.stage'])
  // Should return object with config and metadata
  assert.ok(result.config, 'Should have config property')
  assert.ok(result.metadata, 'Should have metadata property')

  // Config should be resolved
  assert.is(result.config.stage, 'prod')
  // Note: region might be empty if AWS_REGION env var is set to empty string
  assert.ok('region' in result.config, 'Should have region property')

  // Metadata should have expected structure
  assert.ok(result.metadata.variables, 'Should have variables')
  assert.ok(result.metadata.fileRefs, 'Should have fileRefs')
  assert.ok(result.metadata.summary, 'Should have summary')

  // Should have resolutionHistory for debugging
  assert.ok(result.resolutionHistory, 'Should have resolutionHistory property')
  assert.is(typeof result.resolutionHistory, 'object', 'resolutionHistory should be an object')
  
  // resolutionHistory should be keyed by path
  const historyKeys = Object.keys(result.resolutionHistory)
  assert.ok(historyKeys.length > 0, 'Should have resolution history for at least one path')
  
  // Check structure of a history entry
  const firstKey = historyKeys[0]
  const firstHistory = result.resolutionHistory[firstKey]
  assert.ok(firstHistory.path, 'History entry should have path')
  
  // Log one example for inspection
  console.log('\n📝 Example Resolution History:')
  console.log(`Path: ${firstHistory.path}`)
  if (firstHistory.resolutionHistory) {
    console.log('Resolution steps:', JSON.stringify(firstHistory.resolutionHistory, null, 2))
  }
})

test('metadata contains variable information', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'dev'
    }
  })

  const { metadata } = result

  // Check that variables were found
  assert.ok(Object.keys(metadata.variables).length > 0, 'Should find variables')

  // Check variable structure
  const varKeys = Object.keys(metadata.variables)
  const firstVar = metadata.variables[varKeys[0]][0]

  assert.ok(firstVar.path, 'Variable should have path')
  assert.ok(firstVar.key, 'Variable should have key')
  assert.ok(firstVar.value, 'Variable should have value')
  assert.ok(firstVar.variable, 'Variable should have variable')
  assert.ok(typeof firstVar.isRequired === 'boolean', 'Variable should have isRequired')
  assert.ok(Array.isArray(firstVar.resolveOrder), 'Variable should have resolveOrder array')
  assert.ok(Array.isArray(firstVar.resolveDetails), 'Variable should have resolveDetails array')
})

test('metadata.fileRefs contains file references', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {}
  })

  const { metadata } = result

  // Check that file refs were extracted
  assert.ok(Array.isArray(metadata.fileRefs), 'fileRefs should be an array')
  assert.ok(metadata.fileRefs.length > 0, 'Should find file references')

  // Check that our test files are in the refs
  assert.ok(
    metadata.fileRefs.includes('./database.json'),
    'Should include database.json reference'
  )
})

test('metadata.summary contains statistics', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {}
  })

  const { summary } = result.metadata

  assert.ok(typeof summary.totalVariables === 'number', 'Should have totalVariables count')
  assert.ok(typeof summary.requiredVariables === 'number', 'Should have requiredVariables count')
  assert.ok(typeof summary.variablesWithDefaults === 'number', 'Should have variablesWithDefaults count')

  // Total should equal required + with defaults
  assert.is(
    summary.totalVariables,
    summary.requiredVariables + summary.variablesWithDefaults,
    'Total should equal required + with defaults'
  )
})

test('without returnMetadata flag returns only config', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
    options: {
      stage: 'dev'
    }
  })

  // Should return just the config object, not wrapped
  assert.is(typeof result, 'object', 'Should return an object')
  assert.is(result.stage, 'dev', 'Should have resolved config values')
  assert.not.ok(result.metadata, 'Should not have metadata property')
  assert.not.ok(result.config, 'Should not be wrapped in config property')
})

test('metadata identifies required vs optional variables', async () => {
  const object = {
    optional: '${env:OPTIONAL_VAR, "default"}',
    fallback: 'fallback-value'
  }

  const result = await configorama(object, {
    returnMetadata: true,
    options: {}
  })

  const { variables } = result.metadata

  // Find the optional variable
  const optionalVarKey = Object.keys(variables).find(k => k.includes('OPTIONAL_VAR'))
  assert.ok(optionalVarKey, 'Should find optional variable')
  assert.is(variables[optionalVarKey][0].isRequired, false, 'Should mark as not required')
  assert.is(variables[optionalVarKey][0].defaultValue, 'default', 'Should have default value')
})

test('metadata works with inline config objects', async () => {
  const object = {
    foo: 'bar',
    env: '${env:NODE_ENV, development}',
    stage: '${opt:stage, dev}'
  }

  const result = await configorama(object, {
    returnMetadata: true,
    options: {
      stage: 'test'
    }
  })

  assert.ok(result.config, 'Should have config')
  assert.ok(result.metadata, 'Should have metadata')
  assert.ok(result.metadata.variables, 'Should have variables')
  assert.ok(result.metadata.fileRefs, 'Should have fileRefs')
  assert.ok(result.metadata.summary, 'Should have summary')
})

test('metadata resolveDetails includes varType information', async () => {
  const object = {
    envVar: '${env:MY_VAR, default-env}',
    optVar: '${opt:myOption, default-opt}',
    selfVar: '${self:other}',
    other: 'value'
  }

  const result = await configorama(object, {
    returnMetadata: true,
    options: {}
  })

  const { variables } = result.metadata

  // Check env variable - lookup with full match including fallback
  const envVarKey = Object.keys(variables).find(k => k.includes('env:MY_VAR'))
  assert.ok(envVarKey, 'Should find env variable')
  const envVar = variables[envVarKey]
  assert.ok(
    envVar[0].resolveDetails.some(d => d.varType === 'env:'),
    'Should have env: varType'
  )

  // Check opt variable
  const optVarKey = Object.keys(variables).find(k => k.includes('opt:myOption'))
  assert.ok(optVarKey, 'Should find opt variable')
  const optVar = variables[optVarKey]
  assert.ok(
    optVar[0].resolveDetails.some(d => d.varType === 'opt:'),
    'Should have opt: varType'
  )

  // Check self variable
  const selfVarKey = Object.keys(variables).find(k => k.includes('self:other'))
  assert.ok(selfVarKey, 'Should find self variable')
  const selfVar = variables[selfVarKey]
  assert.ok(
    selfVar[0].resolveDetails.some(d => d.varType === 'self:' || d.varType === 'dot.prop'),
    'Should have self: or dot.prop varType'
  )
})

test('metadata resolveDetails includes afterInnerResolution for nested variables', async () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = await configorama(configFile, {
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

  // Check that innermost variable (${self:stage}) has afterInnerResolution
  const selfStageDetail = fileVar.resolveDetails.find(d => d.variable === 'self:stage')
  assert.ok(selfStageDetail, 'Should find self:stage detail')
  assert.ok(selfStageDetail.afterInnerResolution, 'Should have afterInnerResolution')
  // Inner variables show the context they were resolved in
  assert.ok(
    selfStageDetail.afterInnerResolution.includes('file(./database-'),
    'Should show context of self:stage resolution'
  )

  // Check that outer variable has afterInnerResolution showing the path after inner vars resolved
  const fileDetail = fileVar.resolveDetails.find(d => d.varType && d.varType.startsWith('file('))
  assert.ok(fileDetail, 'Should find file() detail')
  assert.ok(fileDetail.afterInnerResolution, 'Should have afterInnerResolution for file reference')
  assert.is(
    fileDetail.afterInnerResolution,
    'file(./database-prod.json)',
    'Should show file path after self:stage resolved to prod'
  )
})

test('metadata.resolvedFileRefs contains actual file paths after variable resolution', async () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { metadata } = result

  // Should have both fileRefs (patterns) and resolvedFileRefs (actual paths)
  assert.ok(Array.isArray(metadata.fileRefs), 'Should have fileRefs array')
  assert.ok(Array.isArray(metadata.resolvedFileRefs), 'Should have resolvedFileRefs array')

  // fileRefs should include the pattern with variable
  assert.ok(
    metadata.fileRefs.includes('./database-${self:stage}.json'),
    'fileRefs should include pattern with variable'
  )

  // resolvedFileRefs should include the resolved path
  assert.ok(
    metadata.resolvedFileRefs.includes('./database-prod.json'),
    'resolvedFileRefs should include resolved path ./database-prod.json'
  )

  // Both should include the simple file reference
  assert.ok(
    metadata.fileRefs.includes('./database.json'),
    'fileRefs should include simple file reference'
  )
  assert.ok(
    metadata.resolvedFileRefs.includes('./database.json'),
    'resolvedFileRefs should include simple file reference'
  )
})

test.run()
