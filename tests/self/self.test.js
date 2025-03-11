const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  try {
    const configFile = path.join(__dirname, 'self.yml')
    config = await configorama(configFile, {
      options: args
    })
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
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('normalKey', () => {
  assert.is(config.normalKey, 'valueHere')
})

test('wowTrue', () => {
  assert.is(config.wowTrue, true)
})

test('env from wowTrue', () => {
  assert.is(config.envTest, true)
})

test('topLevelSelf', () => {
  assert.is(config.topLevelSelf, 'otherKeyValue')
})

test('nested', () => {
  assert.is(config.nested, 'veryNested')
})

test('deeperKey', () => {
  assert.is(config.deeperKey.value, 'nextValueHere')
})

test('emptyTwo equals toplevel self', () => {
  assert.is(config.emptyTwo, 'thirdValue1234')
})

test.run()
