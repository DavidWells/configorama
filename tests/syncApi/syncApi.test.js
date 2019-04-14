/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama, { sync } from '../../lib'

let config
let order = [
  'one'
]
// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const yamlFile = path.join(__dirname, 'syncApi.yml')
  config = sync(yamlFile, {}, args)
  order.push('two')
  console.time('perf')
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.timeEnd('perf')
  console.log(`-------------`)
})

test('sync call is blocking', (t) => {
  t.deepEqual(order, ['one', 'two'])
})

test('Normal return ${file(./asyncValue.js)}', (t) => {
  t.is(config.asyncJSValue, 'asyncval')
})

test('Object return ${file(./asyncValueObject.js):func.key}', (t) => {
  t.is(config.asyncKey, 'asyncValueFromObject')
})

test('sync stage: ${opt:stage}', (t) => {
  t.is(config.stage, 'dev')
})
