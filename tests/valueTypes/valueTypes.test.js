/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envNumber = 100
process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  try {
    const configFile = path.join(__dirname, 'valueTypes.yml')
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
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

test('valueAsNumber', () => {
  assert.is(config.valueAsNumber, 1)
})

test('valueAsNumberVariable', () => {
  assert.is(config.valueAsNumberVariable, 5)
})

test('valueAsString', () => {
  assert.is(config.valueAsString, 'string value')
})

test('valueAsStringSingleQuotes', () => {
  assert.is(config.valueAsStringSingleQuotes, 'single quotes')
})

test('valueAsStringDoubleQuotes', () => {
  assert.is(config.valueAsStringDoubleQuotes, 'double quotes')
})

test('valueAsStringVariableSingleQuotes', () => {
  assert.is(config.valueAsStringVariableSingleQuotes, 'single-quotes-var')
})

test('valueAsStringVariableDoubleQuotes', () => {
  assert.is(config.valueAsStringVariableDoubleQuotes, 'double-quotes-var')
})

test('valueWithEqualSign', () => {
  assert.is(config.valueWithEqualSign, 'this=value=has=equal')
})

test('valueWithTwoFallbackValues', () => {
  assert.is(config.valueWithTwoFallbackValues, 1)
})

test('valueAsBoolean', () => {
  assert.is(config.valueAsBoolean, true)
})

test('selfReference', (t) => {
  assert.is(config.selfReference, 'value')
})

test('envReference', (t) => {
  assert.is(config.envReference, 'env var')
})

test('cliFlag', (t) => {
  assert.is(config.cliFlag, 'dev')
})

test('cliFlagEmpty', (t) => {
  assert.is(config.cliFlagEmpty, 'cliFlagEmptyValue')
})

test('cliFlagComposed', (t) => {
  assert.is(config.cliFlagComposed, 'dev-secret')
})

test('Composed objects', (t) => {
  assert.is(config.resolvedDomainName, 'api-dev.my-site.com')
})

test.run()
