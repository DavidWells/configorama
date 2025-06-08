const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    environment: 'test'
  }

  const configFile = path.join(__dirname, 'preprocesser.yml')
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

test('param is a string with resolve syntax', () => {
  assert.is(config.param, '{{resolve:ssm:parameter-name:version}}')
})

test('secureParam is a string with resolve-secure syntax', () => {
  assert.is(config.secureParam, '{{resolve:ssm-secure:parameter-name:version}}')
})

test('secrets is a string with secretsmanager syntax', () => {
  assert.is(config.secrets, '{{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}')
})

test('paramAsObj is an object with resolve syntax', () => {
  assert.equal(config.paramAsObj, '{{resolve:ssm:parameter-name:version}}')
})

test('secureParamAsObj is an object with resolve-secure syntax', () => {
  assert.equal(config.secureParamAsObj, '{{resolve:ssm-secure:parameter-name:version}}')
})

test('secretsAsObj is an object with secretsmanager syntax', () => {
  assert.equal(config.secretsAsObj, '{{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}')
})

test.run()
