/* Test for configorama.analyze() method */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('configorama.analyze returns pre-resolved variable metadata', async () => {
  const configFile = path.join(__dirname, 'api.yml')

  const result = await configorama.analyze(configFile, {
    options: {
      stage: 'dev',
    }
  })

  // Should return metadata structure (not the resolved config)
  assert.ok(result.variables, 'Should have variables property')
  assert.ok(result.summary, 'Should have summary property')

  // Variables should NOT be resolved yet
  const varKeys = Object.keys(result.variables)
  assert.ok(varKeys.length > 0, 'Should find variables')

  // Check that we have the expected variables from api.yml
  const hasOptStage = varKeys.some(k => k.includes('opt:stage'))
  assert.ok(hasOptStage, 'Should find opt:stage variable')
})

test('configorama.analyze works with object config', async () => {
  const config = {
    stage: '${opt:stage}',
    region: '${env:AWS_REGION, "us-east-1"}',
  }

  const result = await configorama.analyze(config, {
    options: {
      stage: 'prod',
    }
  })

  assert.ok(result.variables, 'Should have variables property')
  assert.ok(result.summary, 'Should have summary property')

  const varKeys = Object.keys(result.variables)
  assert.is(varKeys.length, 2, 'Should find 2 variables')
})

// Tests for self-reference resolution in metadata
test('self-reference to object resolves defaultValue correctly', async () => {
  const config = {
    custom: {
      cors: {
        origin: '*',
        headers: ['Content-Type', 'Authorization']
      }
    },
    functions: {
      api: {
        cors: '${self:custom.cors}'
      }
    }
  }

  const result = await configorama.analyze(config)

  // Find the self:custom.cors variable
  const corsVarKey = Object.keys(result.variables).find(k => k.includes('self:custom.cors'))
  assert.ok(corsVarKey, 'Should find self:custom.cors variable')

  const corsVar = result.variables[corsVarKey][0]

  // Should have defaultValue set to the resolved object
  assert.ok(corsVar.defaultValue, 'Should have defaultValue')
  assert.is(corsVar.defaultValue.origin, '*', 'defaultValue.origin should be *')
  assert.ok(Array.isArray(corsVar.defaultValue.headers), 'defaultValue.headers should be array')

  // Should have defaultValueSrc pointing to the config path
  assert.is(corsVar.defaultValueSrc, 'custom.cors', 'defaultValueSrc should be custom.cors')

  // Should NOT be required since it has a resolvable default
  assert.is(corsVar.isRequired, false, 'isRequired should be false')
})

test('self-reference to string resolves defaultValue correctly', async () => {
  const config = {
    service: 'my-service',
    resources: {
      name: '${self:service}-resource'
    }
  }

  const result = await configorama.analyze(config)

  // Check uniqueVariables for self:service
  assert.ok(result.uniqueVariables, 'Should have uniqueVariables')
  const serviceVar = result.uniqueVariables['self:service']
  assert.ok(serviceVar, 'Should have self:service in uniqueVariables')

  // Should have occurrence with correct defaultValue
  assert.ok(serviceVar.occurrences.length > 0, 'Should have occurrences')
  const occ = serviceVar.occurrences[0]
  assert.is(occ.defaultValue, 'my-service', 'defaultValue should be my-service')
  assert.is(occ.defaultValueSrc, 'service', 'defaultValueSrc should be service')
  assert.is(occ.isRequired, false, 'isRequired should be false')
})

test('self-reference with inline fallback uses resolved value not fallback', async () => {
  const config = {
    custom: {
      cors: { origin: '*' }
    },
    functions: {
      api: {
        cors: '${self:custom.cors, false}'
      }
    }
  }

  const result = await configorama.analyze(config)

  // Find the variable with fallback
  const corsVarKey = Object.keys(result.variables).find(k =>
    k.includes('self:custom.cors') && k.includes('false')
  )
  assert.ok(corsVarKey, 'Should find self:custom.cors with fallback')

  const corsVar = result.variables[corsVarKey][0]

  // defaultValue should be the resolved object, NOT "false"
  assert.ok(typeof corsVar.defaultValue === 'object', 'defaultValue should be object, not string "false"')
  assert.is(corsVar.defaultValue.origin, '*', 'defaultValue.origin should be *')
  assert.is(corsVar.defaultValueSrc, 'custom.cors', 'defaultValueSrc should be custom.cors')
})

test('sibling variables in compound string get correct defaultValues', async () => {
  const config = {
    service: 'my-app',
    provider: {
      stage: '${opt:stage, "dev"}'
    },
    resources: {
      name: '${self:service}-${self:provider.stage}-pool'
    }
  }

  const result = await configorama.analyze(config)

  // Check uniqueVariables for self:service (sibling in compound string)
  const serviceVar = result.uniqueVariables['self:service']
  assert.ok(serviceVar, 'Should have self:service in uniqueVariables')

  // Find occurrence from the compound string
  const compoundOcc = serviceVar.occurrences.find(o =>
    o.originalString.includes('${self:provider.stage}')
  )
  assert.ok(compoundOcc, 'Should have occurrence from compound string')
  assert.is(compoundOcc.defaultValue, 'my-app', 'self:service defaultValue should be my-app')
  assert.is(compoundOcc.defaultValueSrc, 'service', 'defaultValueSrc should be service')
  assert.is(compoundOcc.isRequired, false, 'isRequired should be false')
})

test('unresolvable self-reference marks variable as required', async () => {
  const config = {
    functions: {
      api: {
        handler: '${self:custom.undefined.path}'
      }
    }
  }

  const result = await configorama.analyze(config)

  const varKey = Object.keys(result.variables).find(k => k.includes('self:custom.undefined'))
  assert.ok(varKey, 'Should find the variable')

  const varData = result.variables[varKey][0]
  assert.is(varData.isRequired, true, 'Should be required when self-ref cannot resolve')
  assert.is(varData.defaultValue, undefined, 'Should not have defaultValue')
})

test('metadata summary counts required vs defaults correctly', async () => {
  const config = {
    service: 'my-service',
    stage: '${opt:stage}', // required - no default
    region: '${opt:region, "us-east-1"}', // has default
    name: '${self:service}-app' // has default from self-ref
  }

  const result = await configorama.analyze(config)

  assert.ok(result.summary, 'Should have summary')
  assert.is(result.summary.requiredVariables, 1, 'Should have 1 required variable (opt:stage)')
  assert.is(result.summary.variablesWithDefaults, 2, 'Should have 2 variables with defaults')
})

test('uniqueVariables groups occurrences by base variable name', async () => {
  const config = {
    custom: { value: 'test' },
    a: '${self:custom.value}',
    b: '${self:custom.value}',
    c: '${self:custom.value, "fallback"}'
  }

  const result = await configorama.analyze(config)

  const customValueVar = result.uniqueVariables['self:custom.value']
  assert.ok(customValueVar, 'Should have self:custom.value in uniqueVariables')

  // Should have 3 occurrences (all 3 usages)
  assert.is(customValueVar.occurrences.length, 3, 'Should have 3 occurrences')

  // All should have the same resolved defaultValue
  for (const occ of customValueVar.occurrences) {
    assert.is(occ.defaultValue, 'test', 'All occurrences should have defaultValue "test"')
    assert.is(occ.isRequired, false, 'All occurrences should not be required')
  }
})

test('analyze serverless fixture has correct self-reference metadata', async () => {
  const configFile = path.join(__dirname, '../_fixtures/serverless.yml')

  const result = await configorama.analyze(configFile)

  // Check self:custom.cors resolves to object
  const corsVar = result.uniqueVariables['self:custom.cors']
  assert.ok(corsVar, 'Should have self:custom.cors')
  assert.ok(corsVar.occurrences.length > 0, 'Should have occurrences')

  const corsOcc = corsVar.occurrences[0]
  assert.ok(typeof corsOcc.defaultValue === 'object', 'defaultValue should be object')
  assert.is(corsOcc.defaultValue.origin, '*', 'cors origin should be *')
  assert.ok(Array.isArray(corsOcc.defaultValue.headers), 'cors headers should be array')
  assert.is(corsOcc.defaultValueSrc, 'custom.cors', 'defaultValueSrc should be custom.cors')

  // Check self:service resolves to string
  const serviceVar = result.uniqueVariables['self:service']
  assert.ok(serviceVar, 'Should have self:service')

  const serviceOcc = serviceVar.occurrences[0]
  assert.is(serviceOcc.defaultValue, 'auth-service-testing', 'service defaultValue should be auth-service-testing')
  assert.is(serviceOcc.defaultValueSrc, 'service', 'defaultValueSrc should be service')
  assert.is(serviceOcc.isRequired, false, 'service should not be required')
})

test('variables structure has expected shape', async () => {
  const config = {
    custom: { value: 'test' },
    item: '${self:custom.value}'
  }

  const result = await configorama.analyze(config)

  const varKey = Object.keys(result.variables).find(k => k.includes('self:custom.value'))
  const varInstance = result.variables[varKey][0]

  // Assert on required fields
  assert.ok('path' in varInstance, 'Should have path')
  assert.ok('key' in varInstance, 'Should have key')
  assert.ok('originalStringValue' in varInstance, 'Should have originalStringValue')
  assert.ok('variable' in varInstance, 'Should have variable')
  assert.ok('isRequired' in varInstance, 'Should have isRequired')
  assert.ok('resolveDetails' in varInstance, 'Should have resolveDetails')
  assert.ok('resolveOrder' in varInstance, 'Should have resolveOrder')

  // Check resolveDetails shape
  assert.ok(Array.isArray(varInstance.resolveDetails), 'resolveDetails should be array')
  const detail = varInstance.resolveDetails[0]
  assert.ok('variableType' in detail, 'resolveDetail should have variableType')
  assert.ok('variable' in detail, 'resolveDetail should have variable')
  assert.ok('start' in detail, 'resolveDetail should have start')
  assert.ok('end' in detail, 'resolveDetail should have end')
})

test('uniqueVariables structure has expected shape', async () => {
  const config = {
    stage: '${opt:stage, "dev"}'
  }

  const result = await configorama.analyze(config)

  assert.ok(result.uniqueVariables, 'Should have uniqueVariables')

  const optStageVar = result.uniqueVariables['opt:stage']
  assert.ok(optStageVar, 'Should have opt:stage')

  // Check shape
  assert.ok('variable' in optStageVar, 'Should have variable')
  assert.ok('variableType' in optStageVar, 'Should have variableType')
  assert.ok('occurrences' in optStageVar, 'Should have occurrences')
  assert.ok(Array.isArray(optStageVar.occurrences), 'occurrences should be array')

  // Check occurrence shape
  const occ = optStageVar.occurrences[0]
  assert.ok('originalString' in occ, 'occurrence should have originalString')
  assert.ok('varMatch' in occ, 'occurrence should have varMatch')
  assert.ok('path' in occ, 'occurrence should have path')
  assert.ok('isRequired' in occ, 'occurrence should have isRequired')
  assert.ok('hasFilters' in occ, 'occurrence should have hasFilters')
  assert.ok('hasFallback' in occ, 'occurrence should have hasFallback')
})

test.run()
