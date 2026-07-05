/* eslint-disable no-template-curly-in-string */
/**
 * Tests for loading .tf files directly as main config
 * Verifies auto-switch to ${{ }} syntax preserves Terraform interpolations
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog } = require('../utils')

let config

const setup = async () => {
  try {
    process.env.foo = 'bar'
    // Load main.tf directly - should auto-use ${{ }} syntax
    const configFile = path.join(__dirname, 'main.tf')
    config = await configorama(configFile)
    deepLog('config', config)
    console.log(`-------------`)
    console.log(`Direct .tf load test`)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('preserves ${var.xxx} terraform interpolation', () => {
  // locals[0].app_name should contain the raw terraform interpolation
  assert.is(config.locals[0].app_name, 'myapp-${var.environment}')
})

test('preserves ${map(string)} terraform type', () => {
  assert.is(config.variable.tags[0].type, '${map(string)}')
})

test('preserves ${string} terraform type', () => {
  assert.is(config.variable.region[0].type, '${string}')
})

test('preserves ${number} terraform type', () => {
  assert.is(config.variable.instance_count[0].type, '${number}')
})

test('preserves complex terraform expression', () => {
  // common_tags contains a merge() expression
  assert.ok(config.locals[0].common_tags.includes('merge('))
  assert.ok(config.locals[0].common_tags.includes('var.tags'))
})

test('resolves simple values correctly', () => {
  assert.is(config.variable.region[0].default, 'us-east-1')
  assert.is(config.variable.instance_count[0].default, 2)
})

test.run()
