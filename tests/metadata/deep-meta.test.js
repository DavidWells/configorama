/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { deepLog } = require('../utils')
const configorama = require('../../src')

process.env.envNumber = 100
process.env.MY_SECRET = 'lol hi there'
process.env.MY_ENV_VAR = 'prod'

test('Nested file references', async () => {
  const configFile = path.join(__dirname, '../fileValues/fileValues.yml')
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: args
  })

  deepLog('result', result)

  
})

test.run()
