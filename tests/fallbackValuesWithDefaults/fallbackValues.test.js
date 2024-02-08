/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envValue = 'env-value'
process.env.envValueTwo = 'three'
// process.env.holo = 'ololo'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'fallbackValues.yml')
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

test("Default: ${self:custom.fun, ''}", (t) => {
  t.is(config.resources.subItem.Default, 'my-slug')
})

test("${self:custom.domainName, ''}", (t) => {
  t.is(config.resources.Parameters.Domain.Default, 'domainxyz.com')
})

test("config.resources.x", (t) => {
  t.is(config.resources.x, 'domainxyz.com')
})

test("config.resources.y", (t) => {
  t.is(config.resources.y, 'default-value')
})

test("set default", (t) => {
  t.is(config.set, 'default-value')
})

test("default-value-two", (t) => {
  t.is(config.resources.subItem.set, 'default-value-two')
})