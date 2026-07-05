/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envValue = 'env-value'
process.env.envValueTwo = 'three'
// process.env.holo = 'ololo'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  try {
    const configFile = path.join(__dirname, 'fallbackValues.yml')
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test("Default: ${self:custom.fun, ''}", () => {
  assert.is(config.resources.subItem.Default, 'my-slug')
})

test("${self:custom.domainName, ''}", () => {
  assert.is(config.resources.Parameters.Domain.Default, 'domainxyz.com')
})

test("config.resources.x", () => {
  assert.is(config.resources.x, 'domainxyz.com')
})

test("config.resources.y", () => {
  assert.is(config.resources.y, 'default-value')
})

test("set default", () => {
  assert.is(config.set, 'default-value')
})

test("default-value-two", () => {
  assert.is(config.resources.subItem.set, 'default-value-two')
})

test.run()