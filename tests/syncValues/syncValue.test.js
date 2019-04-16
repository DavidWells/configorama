import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'syncValue.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('Normal return', (t) => {
  t.is(config.syncJSValue, 'SyncValue')
})

test('Object return', (t) => {
  t.is(config.syncKey, 'syncValueFromObject')
})

test('Object return two', (t) => {
  t.is(config.syncKeyTwo, 'syncValueTwoFromObject')
})

test('Object return ${self:normalKey}', (t) => {
  t.is(config.syncKeyThreeVariable, 'variable key three')
})
