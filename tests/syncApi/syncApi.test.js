/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config
let order = [
  'one'
]
const args = {
  stage: 'dev',
  what: 'prod',
  count: 25
}

// This runs before all tests
test.before(async t => {

  const yamlFile = path.join(__dirname, 'syncApi.yml')
  config = configorama.sync(yamlFile, {
    options: args
  })
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

test('sync custom variable sources', (t) => {
  const yamlFile = path.join(__dirname, 'sync.yml')
  const other = configorama.sync(yamlFile, {
    options: args,
    variableSources: [{
      // Match variables ${consul:xyz}
      match: '^context:',
      // Custom variable source. Must return a promise
      resolver: path.join(__dirname, 'custom-var-one.js')
    }, {
      // Match variables ${consul:xyz}
      match: '^secrets:',
      // Custom variable source. Must return a promise
      resolver: path.join(__dirname, 'custom-var-two.js')
    }]
  })

  t.is(other.context, 'custom var one')
  t.is(other.secrets, 'custom var two')
})

test('throw if match regex not strings', (t) => {
  const yamlFile = path.join(__dirname, 'sync.yml')

  const error = t.throws(() => {
    const x = configorama.sync(yamlFile, {
      options: args,
      variableSources: [{
        // Match variables ${consul:xyz}
        match: RegExp('^context:', 'g'),
        // Custom variable source. Must return a promise
        resolver: path.join(__dirname, 'custom-var-one.js')
      }, {
        // Match variables ${consul:xyz}
        match: /^secrets:/,
        // Custom variable source. Must return a promise
        resolver: path.join(__dirname, 'custom-var-two.js')
      }]
    })
    return x
  })
  t.regex(error.message, /Variable source must be string for .sync usage/)
})

test('throw if match resolver not path', (t) => {
  const yamlFile = path.join(__dirname, 'sync.yml')

  const error = t.throws(() => {
    const x = configorama.sync(yamlFile, {
      options: args,
      variableSources: [{
        // Match variables ${consul:xyz}
        match: '^context:',
        // Custom variable source. Must return a promise
        resolver: () => {
          return 'xyz'
        }
      }, {
        // Match variables ${consul:xyz}
        match: '^secrets:',
        // Custom variable source. Must return a promise
        resolver: () => {
          return 'xyz'
        }
      }]
    })
    return x
  })
  t.regex(error.message, /Variable resolver must be path to file for .sync usage/)
})
