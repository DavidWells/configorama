/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const yamlFile = path.join(__dirname, 'asyncValue.yml')
  const configorama = new Configorama(yamlFile)
  console.time('perf')
  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.timeEnd('perf')
  console.log(`-------------`)
})

test('Normal return ${file(./asyncValue.js)}', (t) => {
  t.is(config.asyncJSValue, 'asyncval')
})

test('Object return ${file(./asyncValueObject.js):func.key}', (t) => {
  t.is(config.asyncKey, 'asyncValueFromObject')
})

test('Object return two ${file(./asyncValueObject.js):func.keyTwo}', (t) => {
  t.is(config.asyncKeyTwo, 'asyncValueFromObjectTwo')
})

test('Object return ${self:selfVar}', (t) => {
  t.is(config.asyncKeyThreeVariable, 'Testing')
})

test('asyncWithFilter', (t) => {
  t.is(config.asyncWithFilter, 'asyncValueFromObjectTwo')
})

test('asyncWithFilterTwo', (t) => {
  t.is(config.asyncWithFilterTwo, 'ASYNCVALUEFROMOBJECT')
})

test('asyncJSValueReference', (t) => {
  t.is(config.asyncJSValueReference, 'asyncValueFromObject')
})
