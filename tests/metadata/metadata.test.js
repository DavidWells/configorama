/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('returnMetadata returns both config and metadata', async () => {
  const configFile = path.join(__dirname, 'test-config.yml')

  const result = await configorama(configFile, {
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
  // Note: region might be empty if AWS_REGION env var is set to empty string
  assert.ok('region' in result.config, 'Should have region property')

  // Metadata should have expected structure
  assert.ok(result.metadata.variables, 'Should have variables')
  assert.ok(result.metadata.fileRefs, 'Should have fileRefs')
  assert.ok(result.metadata.summary, 'Should have summary')
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

test.run()
