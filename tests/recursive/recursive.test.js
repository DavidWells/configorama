import test from 'ava'
import util from 'util'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
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
})

test.after(t => {
  console.log(`-------------`)
})

test('recursively populate, regardless of order and duplication', (t) => {
  t.is(config.val1, 'my value')
  t.is(config.depVal, 'my value')
  t.is(config.val0, 'my value')
  t.is(config.val2, 'my value')
})

test('self: recursively populate, regardless of order and duplication', (t) => {
  t.is(config.valSelf1, 'my value self')
  t.is(config.depSelfVal, 'my value self')
  t.is(config.valSelf0, 'my value self')
  t.is(config.valSelf2, 'my value self')
})
