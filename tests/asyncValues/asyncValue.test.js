/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
  }

  const yamlFile = path.join(__dirname, 'asyncValue.yml')
  console.time('perf')
  try {
    config = await configorama(yamlFile, {
      options: args
    })
  } catch (err) {
    console.log('err', err)
    process.exit(1)
  }

  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.timeEnd('perf')
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('Normal return ${file(./asyncValue.js)}', () => {
  assert.is(config.asyncJSValue, 'asyncval')
})

test('Object return ${file(./asyncValueObject.js):func.key}', () => {
  assert.is(config.asyncKey, 'asyncValueFromObject')
})

test('Object return two ${file(./asyncValueObject.js):func.keyTwo}', () => {
  assert.is(config.asyncKeyTwo, 'asyncValueFromObjectTwo')
})

test('Object return ${self:selfVar}', () => {
  assert.is(config.asyncKeyThreeVariable, 'Testing')
})

test('asyncWithFilter', () => {
  assert.is(config.asyncWithFilter, 'asyncValueFromObjectTwo')
})

test('asyncWithFilterTwo', () => {
  assert.is(config.asyncWithFilterTwo, 'ASYNCVALUEFROMOBJECT')
})

test('asyncJSValueReference', () => {
  assert.is(config.asyncJSValueReference, 'asyncValueFromObject')
})

test.run()
