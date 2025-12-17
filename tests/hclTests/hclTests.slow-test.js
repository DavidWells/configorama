/* eslint-disable no-template-curly-in-string */
/**
 * Integration tests for HCL/Terraform file support in configorama
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog } = require('../utils')
let config

// Setup function
const setup = async () => {
  process.env.foo = 'hello'
  process.env.TF_JSON_TEST_VAR = 'tf-json-env-value'
  const args = {
    stage: 'dev'
  }

  try {
    const configFile = path.join(__dirname, 'hclTests.yml')
    config = await configorama(configFile, {
      options: args,
      // Terraform HCL uses ${...} for type annotations like ${string}, ${number}
      // These should not be resolved by configorama
      allowUnknownVariableTypes: true
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    deepLog('config', config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('tfFullFile - imports full terraform file', () => {
  assert.ok(config.tfFullFile, 'should have tfFullFile')
  assert.ok(config.tfFullFile.variable, 'should have variable section')
  assert.ok(config.tfFullFile.locals, 'should have locals section')
})

test('tfRegion - variable.region.0.default', () => {
  assert.is(config.tfRegion, 'us-east-1')
})

test('tfAppName - variable.app_name.0.default', () => {
  assert.is(config.tfAppName, 'configorama-test')
})

test('tfInstanceCount - variable.instance_count.0.default (number)', () => {
  assert.is(config.tfInstanceCount, 3)
})

test('tfEnabled - variable.enabled.0.default (boolean)', () => {
  assert.is(config.tfEnabled, true)
})

test('tfRegionDesc - variable description', () => {
  assert.is(config.tfRegionDesc, 'AWS region')
})

test('tfLocalsEnv - locals.0.environment', () => {
  assert.is(config.tfLocalsEnv, 'production')
})

test('tfLocalsFullName - locals.0.full_name', () => {
  assert.is(config.tfLocalsFullName, 'myapp-prod')
})

test('tfVariableRegion - entire variable block (array)', () => {
  assert.ok(Array.isArray(config.tfVariableRegion), 'should be array')
  assert.is(config.tfVariableRegion[0].default, 'us-east-1')
  assert.is(config.tfVariableRegion[0].description, 'AWS region')
})

test('tfVariableAppName - entire variable block (array)', () => {
  assert.ok(Array.isArray(config.tfVariableAppName), 'should be array')
  assert.is(config.tfVariableAppName[0].default, 'configorama-test')
})

test('tfRegionDot - dot notation access', () => {
  assert.is(config.tfRegionDot, 'us-east-1')
})

test('tfAppNameDot - dot notation access', () => {
  assert.is(config.tfAppNameDot, 'configorama-test')
})

test('tfMissing - missing file with fallback', () => {
  assert.is(config.tfMissing, 'tfMissingDefault')
})

test('$[env:foo] in .tf resolves when imported from yml', () => {
  // _tfvalues.tf has: default = "$[env:foo]" which should resolve to process.env.foo = 'hello'
  assert.is(config.tfFullFile.variable.regionTwo[0].default, 'hello')
})

// .tf.json tests
test('tfJsonFull - imports full .tf.json file', () => {
  assert.ok(config.tfJsonFull, 'should have tfJsonFull')
  assert.ok(config.tfJsonFull.variable, 'should have variable section')
  assert.ok(config.tfJsonFull.locals, 'should have locals section')
})

test('$[env:TF_JSON_TEST_VAR] in .tf.json resolves', () => {
  assert.is(config.tfJsonEnvVar, 'tf-json-env-value')
})

test('$[env:MISSING_VAR, fallback] in .tf.json uses fallback', () => {
  assert.is(config.tfJsonFallback, 'fallback-value')
})

test('Terraform ${var.xxx} syntax preserved in .tf.json', () => {
  assert.is(config.tfJsonTerraformSyntax, '${var.region}')
})

test.run()
