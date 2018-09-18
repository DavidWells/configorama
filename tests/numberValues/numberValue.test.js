import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

process.env.envNumber = 100

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'numberValue.yml')
  const configorama = new Configorama(configFile)

  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('Normal return', (t) => {
  t.is(config.number, 10)
})

test('numberFromOptionFlag', (t) => {
  t.is(config.numberFromOpt, 25)
})

test('numberFromSelf', (t) => {
  t.is(config.numberFromSelf, 10)
})

test('numberFromDefault', (t) => {
  t.is(config.numberFromDefault, 5)
})

test('numberWithDecimals', (t) => {
  t.is(config.numberWithDecimals, 5.55555)
})

test('numberWithLongInput', (t) => {
  t.is(config.numberWithLongInput, 50000000000)
})

test('numberZero', (t) => {
  t.is(config.numberZero, 0)
})

test('numberAsZero', (t) => {
  t.is(config.numberAsZero, 0)
})
