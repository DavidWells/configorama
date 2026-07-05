/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { deepLog } = require('../utils')
const configorama = require('../../src')

test('Nested file references', async () => {
  process.env.foo = 'hello'
  // const configFile = path.join(__dirname, 'test-config-three.yml')
  // const configFile = path.join(__dirname, '../fileValues/fileValues.yml')
  const configFile = path.join(__dirname, 'main.tf')
  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod',
      otherFlag: 'prod',
    }
  })
  deepLog('result', result)
  deepLog('variable information', result.metadata.variables)
  deepLog('uniqueVariables', result.metadata.uniqueVariables)

})

test.run()