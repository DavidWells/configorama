/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  try {
    const configFile = path.join(__dirname, 'filters.yml')
    const rawConfig = await configorama(configFile, {
      options: args
    })
    // Wrap config in tracking proxy
    config = createTrackingProxy(rawConfig)
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
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('deep equality', () => {
  assert.equal(config, {
    normalKey: 'value',
    keyTwo: 'what-is-up',
    keyThree: 'TheGooseIsLoose',
    toUpperCaseString: 'VALUE',
    toKebabCaseString: 'value-here',
    originalStage: 'dev',
    stageToUpper: 'DEV',
    deepVarTest: 'What-is-up',
    deepVarTestTwo: 'whatIsUp',
    toKebabCase: 'the-goose-is-loose',
    toCamelCase: 'whatIsUp',
    valueWithAsterisk: '*.MYSTAGE.COM',
    filter: 'VALUE',
    valueWithSeparators: 'lol-hi-_ ha,ha',
    inner: 'hi',
    innerObject: { value: 'ha' },
    filterUsingVariableInputs: 'lol-hi-_ ha,ha',
    filterUsingVariableObjectInputs: 'lol-hi-_ ha,ha',
    test: 'value',
    splitTest: 'LOL-HI-_ HA,HA',
    splitTestTwo: 'LOL-HI-_ HA,HA',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.my-site.com',
      staging: 'api-staging.my-site.com',
      dev: 'api-dev.my-site.com'
    },
    resolvedDomainName: 'api-dev.my-site.com',
    fallbackTest: 'foo',
    fallbackTestTwo: 'foo',
    fooInCaps: 'FOO',
    fooInLowerCase: 'foo',
    fooInCapitalize: 'Foo',
    fooInCamelCase: 'foo',
    fooInKebabCase: 'foo',
    chainedFiltersTwo: 'dev',
    chainedFiltersThree: 'Hello-world',
    chainedNumberToString: '42',
    chainedWithHelp: 'TESTVALUE'
  })
})

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

test('fooInCaps', () => {
  assert.is(config.fooInCaps, 'FOO')
})

test('fooInLowerCase', () => {
  assert.is(config.fooInLowerCase, 'foo')
})

// Multiple chained filters - regression tests
test('chainedFiltersTwo - two filters applied', () => {
  // dev -> DEV -> dev (toUpperCase then toKebabCase)
  assert.is(config.chainedFiltersTwo, 'dev')
})

test('chainedFiltersThree - three filters applied in order', () => {
  // helloWorld -> hello-world -> HELLO-WORLD -> Hello-world
  assert.is(config.chainedFiltersThree, 'Hello-world')
})

test('chainedNumberToString - Number then toString', () => {
  // '42' -> 42 (Number) -> '42' (toString)
  assert.is(config.chainedNumberToString, '42')
  assert.type(config.chainedNumberToString, 'string')
})

test('chainedWithHelp - filter before help() is applied', () => {
  // testValue -> TESTVALUE (toUpperCase) -> TESTVALUE (help is identity)
  assert.is(config.chainedWithHelp, 'TESTVALUE')
})

test.run()
