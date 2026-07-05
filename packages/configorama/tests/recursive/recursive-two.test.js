const { test } = require('uvu')
const assert = require('uvu/assert')
const util = require('util')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envReference = 'env var'

const configFile = path.join(__dirname, '../_fixtures/recurse.yml')

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  try {
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(util.inspect(config, false, null, true))
    console.log(`-------------`)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('recursively populate files', () => {
  console.log(util.inspect(config, false, null, true))
  assert.equal(config,{
    provider: { name: 'aws', environment: { MY_SECRET: 'dev creds here' } }
  })
})

test('recursively populate files', async() => {
  console.log(util.inspect(config, false, null, true))
  const configTwo = await configorama(configFile, {
    options: { stage: 'prod' }
  })
  assert.equal(configTwo,{
    provider: { name: 'aws', environment: { MY_SECRET: 'prod creds here' } }
  })
})

test.run()
