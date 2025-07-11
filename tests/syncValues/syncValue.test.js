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

  try {
    const configFile = path.join(__dirname, 'syncValue.yml')
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.log(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('Normal return', () => {
  assert.is(config.syncJSValue, 'SyncValue')
})

test('Object return', () => {
  assert.is(config.syncKey, 'syncValueFromObject')
})

test('Object return two', () => {
  assert.is(config.syncKeyTwo, 'syncValueTwoFromObject')
})

test('Object return ${self:normalKey}', () => {
  assert.is(config.syncKeyThreeVariable, 'variable key three')
})

test.run()
