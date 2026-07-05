/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envValue = 'env-value'
process.env.envValueTwo = 'three'
// process.env.holo = 'ololo'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'fallbackValues.yml')
  try {
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

test('fallback: ${empty, number}', () => {
  assert.is(config.fallback, 10)
})

test('fallbackNumber: ${empty, 99}', () => {
  assert.is(config.fallbackNumber, 99)
})

test('fallbackValue should have spaces', () => {
  assert.is(config.fallbackValueSpaces, 'space is cool')
})

test('fallbackValue should have spaces from other variable', () => {
  assert.is(config.fallbackValueSpacesTwo, 'I have spaces')
})

// TODO fix third fallback
test("fallbackValueThree: ${empty, ${doh}, 'this thing'}", () => {
  assert.is(config.fallbackValueThree, 'hey')
})

test("fallbackValueShouldBeSelf: ${empty, ${holoDeck}, 'here it is'}", () => {
  assert.is(config.fallbackValueShouldBeSelf, 'here it is')
})

test("fallbackValueShouldBeSelfLong: ${empty, ${self:madeUpThing}, 'self fallback'}", () => {
  assert.is(config.fallbackValueShouldBeSelfLong, 'self fallback')
})

test("fallbackValueShouldBeEnv: ${empty, ${env:nothingHere}, 'env fallback'}", () => {
  assert.is(config.fallbackValueShouldBeEnv, 'env fallback')
})

test("fallbackValueShouldBeOpt: ${empty, ${opt:nothingHere}, 'opt fallback'}", () => {
  assert.is(config.fallbackValueShouldBeOpt, 'opt fallback')
})

test("fallbackValueShouldBeFile: ${empty, ${file(./fakeFile.yml)}, 'file fallback'}", () => {
  assert.is(config.fallbackValueShouldBeFile, 'file fallback')
})

test('fallbackNumberZero: ${empty, 0}', () => {
  assert.is(config.fallbackNumberZero, 0)
})

test("fallbackString: ${empty, 'ninety-nine'}", () => {
  assert.is(config.fallbackString, 'ninety-nine')
})

test('fallbackStringTwo: ${empty, "_nine-nine_"}', () => {
  assert.is(config.fallbackStringTwo, '_nine-nine_')
})

test('fallbackWithAtSign: ${empty, "foo@bar"}', () => {
  assert.is(config.fallbackWithAtSign, 'foo@bar')
})

test('fallbackSelf: ${empty, number}', () => {
  assert.is(config.fallbackSelf, 10)
})

test('fallbackSelfTwo: ${empty, ${value}}', () => {
  assert.is(config.fallbackSelfTwo, 'xyz')
})

test('fallbackSelfThree: ${empty, ${self:valueTwo}}', () => {
  assert.is(config.fallbackSelfThree, 'two')
})

test('fallbackEnv: ${empty, env:envValue}', () => {
  assert.is(config.fallbackEnv, 'env-value')
})

test('fallbackEnvTwo: ${self:empty, ${env:envValue}}', () => {
  assert.is(config.fallbackEnvTwo, 'env-value')
})

test('fallbackEnvThree: ${empty, ${env:envValueTwo}}', () => {
  assert.is(config.fallbackEnvThree, 'three')
})

test('fallbackInFile:  ${empty, ${file(./config.json):KEY}}', () => {
  assert.is(config.fallbackInFile, 'hi there')
})

test("fallbackInFileNested: ${empty, ${file(./config.${opt:stage, 'dev'}.json):KEY }}", () => {
  assert.is(config.fallbackInFileNested, 'hi there dev')
})

test("fallbackNested", () => {
  assert.is(config.fallbackNested, 'dev-secret')
})

test("fallbackNestedTwo", () => {
  assert.is(config.fallbackNestedTwo, 'dev-secret')
})

test("fallbackSelfFour", () => {
  assert.is(config.fallbackSelfFour, 'value')
})

test.run()
