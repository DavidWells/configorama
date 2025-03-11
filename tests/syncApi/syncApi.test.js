/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

let config
let order = ['one']

const args = {
  stage: 'dev',
  what: 'prod',
  count: 25
}

// Setup function
const setup = async () => {
  try {
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
  } catch (err) {
    console.log('err', err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.timeEnd('perf')
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('sync call is blocking', () => {
  assert.equal(order, ['one', 'two'])
})

test('Normal return ${file(./asyncValue.js)}', () => {
  assert.is(config.asyncJSValue, 'asyncval')
})

test('Object return ${file(./asyncValueObject.js):func.key}', () => {
  assert.is(config.asyncKey, 'asyncValueFromObject')
})

test('sync stage: ${opt:stage}', () => {
  assert.is(config.stage, 'dev')
})

test('sync custom variable sources', () => {
  const yamlFile = path.join(__dirname, 'sync.yml')
  const other = configorama.sync(yamlFile, {
    options: args,
    variableSources: [{
      match: '^context:',
      resolver: path.join(__dirname, 'custom-var-one.js')
    }, {
      match: '^secrets:',
      resolver: path.join(__dirname, 'custom-var-two.js')
    }]
  })

  assert.is(other.context, 'custom var one')
  assert.is(other.secrets, 'custom var two')
})

test('throw if match regex not strings', () => {
  const yamlFile = path.join(__dirname, 'sync.yml')
  
  assert.throws(() => {
    configorama.sync(yamlFile, {
      options: args,
      variableSources: [{
        match: RegExp('^context:', 'g'),
        resolver: path.join(__dirname, 'custom-var-one.js')
      }, {
        match: /^secrets:/,
        resolver: path.join(__dirname, 'custom-var-two.js')
      }]
    })
  }, /Variable source must be string for .sync usage/)
})

test('throw if match resolver not path', () => {
  const yamlFile = path.join(__dirname, 'sync.yml')

  assert.throws(() => {
    configorama.sync(yamlFile, {
      options: args,
      variableSources: [{
        match: '^context:',
        resolver: () => {
          return 'xyz'
        }
      }, 
      {
        match: '^secrets:',
        resolver: () => {
          return 'xyz'
        }
      }]
    })
  }, /Variable resolver must be path to file for .sync usage/)
})

test.run()
