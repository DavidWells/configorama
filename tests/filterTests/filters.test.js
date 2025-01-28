/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'filters.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('toUpperCaseString normal value', () => {
  assert.is(config.toUpperCaseString, 'VALUE')
})

test('toKebabCaseString', () => {
  assert.is(config.toKebabCaseString, 'value-here')
})

test('stageToUpper', () => {
  assert.is(config.stageToUpper, 'DEV')
})

test('toKebabCase TheGooseIsLoose > the-goose-is-loose', () => {
  assert.is(config.toKebabCase, 'the-goose-is-loose')
})

test('toCamelCase what-is-up', () => {
  assert.is(config.toCamelCase, 'whatIsUp')
})

test('valueWithAsterisk', () => {
  assert.is(config.valueWithAsterisk, '*.MYSTAGE.COM')
})

test('deepVarTest capitalize', () => {
  assert.is(config.deepVarTest, 'What-is-up')
})

test('deepVarTestTwo toCamelCase', () => {
  assert.is(config.deepVarTestTwo, 'whatIsUp')
})

test('resolvedDomainName', () => {
  assert.is(config.resolvedDomainName, 'api-dev.my-site.com')
})

test.run()
