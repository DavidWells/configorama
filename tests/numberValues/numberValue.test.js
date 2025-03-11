const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envNumber = 100
console.log('typeof', typeof process.env.envNumber)

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
  }

  const configFile = path.join(__dirname, 'numberValue.yml')
  try {
    const rawConfig = await configorama(configFile, {
      options: args
    })  
    console.log('rawConfig', rawConfig)
    // Wrap config in tracking proxy
    config = createTrackingProxy(rawConfig)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.log('err', err)
    throw err
  }
}

// Teardown function
const teardown = () => {
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('Normal return', () => {
  assert.is(config.number, 10)
})

test('numberFromOptionFlag', () => {
  assert.is(config.numberFromOpt, 25)
})

test('numberFromSelf', () => {
  assert.is(config.numberFromSelf, 10)
})

test('numberFromDefault', () => {
  assert.is(config.numberFromDefault, 5)
})

test('numberWithDecimals', () => {
  assert.is(config.numberWithDecimals, 5.55555)
})

test('numberWithLongInput', () => {
  assert.is(config.numberWithLongInput, 50000000000)
})

test('numberZero', () => {
  assert.is(config.numberZero, 0)
})

test('numberAsZero', () => {
  assert.is(config.numberAsZero, 0)
})

test.run()
