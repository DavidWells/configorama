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

test.run()
