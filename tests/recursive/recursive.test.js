const { test } = require('uvu')
const assert = require('uvu/assert')
const util = require('util')
const path = require('path')
const configorama = require('../../lib')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'recursive.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(util.inspect(config, false, null, true))
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('recursively populate, regardless of order and duplication', () => {
  assert.is(config.val1, 'my value')
  assert.is(config.depVal, 'my value')
  assert.is(config.val0, 'my value')
  assert.is(config.val2, 'my value')
})

test('self: recursively populate, regardless of order and duplication', () => {
  assert.is(config.valSelf1, 'my value self')
  assert.is(config.depSelfVal, 'my value self')
  assert.is(config.valSelf0, 'my value self')
  assert.is(config.valSelf2, 'my value self')
})

test.run()
