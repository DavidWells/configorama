import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'self.yml')
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

test('normalKey', (t) => {
  t.is(config.normalKey, 'valueHere')
})

test('wowTrue', (t) => {
  t.is(config.wowTrue, true)
})

test('env from wowTrue', (t) => {
  t.is(config.envTest, true)
})

test('topLevelSelf', (t) => {
  t.is(config.topLevelSelf, 'otherKeyValue')
})

test('nested', (t) => {
  t.is(config.nested, 'veryNested')
})

test('deeperKey', (t) => {
  t.is(config.deeperKey.value, 'nextValueHere')
})

test('emptyTwo equals toplevel self', (t) => {
  t.is(config.emptyTwo, 'thirdValue1234')
})
