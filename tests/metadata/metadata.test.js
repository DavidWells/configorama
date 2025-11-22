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
  assert.ok(result.metadata.fileDependencies, 'Should have fileDependencies')
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
  assert.ok(result.metadata.fileDependencies, 'Should have fileDependencies')
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
  assert.ok(result.metadata.fileDependencies, 'Should have fileDependencies')
  assert.ok(result.metadata.summary, 'Should have summary')
})

test('metadata resolveDetails includes variableType information', async () => {
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
    envVar[0].resolveDetails.some(d => d.variableType === 'env'),
    'Should have env: variableType'
  )

  // Check opt variable
  const optVarKey = Object.keys(variables).find(k => k.includes('opt:myOption'))
  assert.ok(optVarKey, 'Should find opt variable')
  const optVar = variables[optVarKey]
  assert.ok(
    optVar[0].resolveDetails.some(d => d.variableType === 'options'),
    'Should have opt: variableType'
  )

  // Check self variable
  const selfVarKey = Object.keys(variables).find(k => k.includes('self:other'))
  assert.ok(selfVarKey, 'Should find self variable')
  const selfVar = variables[selfVarKey]
  assert.ok(
    selfVar[0].resolveDetails.some(d => d.variableType === 'self' || d.variableType === 'dot.prop'),
    'Should have self: or dot.prop variableType'
  )
})

test('metadata resolveDetails includes resolvedValue for nested variables', async () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  deepLog('result', result)

  const { variables } = result.metadata

  // Find the nested file reference: ${file(./database-${self:stage}.json)}
  const fileVarKey = Object.keys(variables).find(k => k.includes('file(./database-${self:stage}.json)'))
  assert.ok(fileVarKey, 'Should find nested file variable')

  const fileVar = variables[fileVarKey][0]
  assert.ok(fileVar.resolveDetails, 'Should have resolveDetails')
  assert.ok(fileVar.resolveDetails.length > 1, 'Should have multiple resolveDetails for nested variable')

  // Check that innermost variable (${self:stage}) has resolvedValue
  const selfStageDetail = fileVar.resolveDetails.find(d => d.variable === 'self:stage')
  assert.ok(selfStageDetail, 'Should find self:stage detail')
  assert.ok(selfStageDetail.resolvedValue, 'Should have resolvedValue')
  assert.is(selfStageDetail.resolvedValue, 'prod', 'self:stage should resolve to prod')

  // Check that outer variable has resolvedValue showing the resolved content
  const fileDetail = fileVar.resolveDetails.find(d => d.variableType && d.variableType === 'file')
  assert.ok(fileDetail, 'Should find file() detail')
  assert.ok(fileDetail.resolvedValue, 'Should have resolvedValue for file reference')
})

test('metadata.fileDependencies contains all and resolved file paths', async () => {
  const configFile = path.join(__dirname, 'test-config-two.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { metadata } = result

  console.log('metadata', metadata)

  // Should have fileDependencies with all (patterns) and resolved (actual paths)
  assert.ok(Array.isArray(metadata.fileDependencies.dynamicPaths), 'Should have fileDependencies.dynamicPaths array')
  assert.ok(Array.isArray(metadata.fileDependencies.resolvedPaths), 'Should have fileDependencies.resolvedPaths array')


  // resolved should include the resolved path
  assert.ok(
    metadata.fileDependencies.resolvedPaths.includes('./database-prod.json'),
    'fileDependencies.resolvedPaths should include resolved path ./database-prod.json'
  )

  const prodDbRef = metadata.fileDependencies.references.find((i) => i.resolvedPath === './database-prod.json')
  assert.ok(prodDbRef, 'Should find prod db reference')
  assert.ok(prodDbRef.refs.length > 0, 'Should have refs')
  assert.is(prodDbRef.refs[0].value, './database-${self:stage}.json', 'Should have original path ./database-${self:stage}.json')

  // Both should include the simple file reference
  assert.ok(
    metadata.fileDependencies.references.find((i) => i.resolvedPath === './database.json'),
    'fileDependencies.all should include simple file reference'
  )
  assert.ok(
    metadata.fileDependencies.resolvedPaths.includes('./database.json'),
    'fileDependencies.resolvedPaths should include simple file reference'
  )
})

test('metadata.uniqueVariables groups variables by base name without fallbacks', async () => {
  const object = {
    regionA: '${env:AWS_REGION, us-east-1}',
    regionB: '${env:AWS_REGION, us-west-2}',
    stage: '${opt:stage, dev}',
    stageRef: '${self:stage}'
  }

  const result = await configorama(object, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  const { uniqueVariables } = result.metadata

  // Should have uniqueVariables
  assert.ok(uniqueVariables, 'Should have uniqueVariables')

  // env:AWS_REGION should be rolled up with both occurrences
  assert.ok(uniqueVariables['env:AWS_REGION'], 'Should have env:AWS_REGION entry')
  assert.is(uniqueVariables['env:AWS_REGION'].variable, 'env:AWS_REGION')
  assert.is(uniqueVariables['env:AWS_REGION'].variableType, 'env')
  assert.is(uniqueVariables['env:AWS_REGION'].occurrences.length, 2, 'Should have 2 occurrences')

  // Check occurrences have expected structure
  const awsOccurrences = uniqueVariables['env:AWS_REGION'].occurrences
  assert.ok(awsOccurrences.some(o => o.fullMatch === '${env:AWS_REGION, us-east-1}'), 'Should have us-east-1 occurrence')
  assert.ok(awsOccurrences.some(o => o.fullMatch === '${env:AWS_REGION, us-west-2}'), 'Should have us-west-2 occurrence')

  // Each occurrence should have expected fields
  const firstOccurrence = awsOccurrences[0]
  assert.ok('fullMatch' in firstOccurrence, 'Should have fullMatch')
  assert.ok('path' in firstOccurrence, 'Should have path')
  assert.ok('isRequired' in firstOccurrence, 'Should have isRequired')
  assert.ok('defaultValue' in firstOccurrence, 'Should have defaultValue')
  assert.ok('hasFallback' in firstOccurrence, 'Should have hasFallback')

  // opt:stage should have 1 occurrence
  assert.ok(uniqueVariables['opt:stage'], 'Should have opt:stage entry')
  assert.is(uniqueVariables['opt:stage'].occurrences.length, 1)

  // self:stage should have 1 occurrence with defaultValueSrc
  assert.ok(uniqueVariables['self:stage'], 'Should have self:stage entry')
  assert.is(uniqueVariables['self:stage'].variableType, 'self')
})

test.run()
