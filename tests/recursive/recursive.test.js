const { test } = require('uvu')
const assert = require('uvu/assert')
const util = require('util')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'recursive.yml')
  try {
    config = await configorama(configFile, {
      options: args
    })
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
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
  console.log(util.inspect(config, false, null, true))
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

test('self: recursively populate, with fallback values', () => {
  assert.is(config.val00, 'foo')
  assert.is(config.val01, 'bar')
  assert.is(config.val02, 'foo:bar')
  assert.is(config.val03, 'foo:bar')
  assert.is(config.val05, 'FOO:BAR')
})

test.run()
