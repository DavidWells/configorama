/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { deepLog } = require('../utils')
const configorama = require('../../src')

test('Nested file references', async () => {
  const configFile = path.join(__dirname, 'test-config-three.yml')

  const result = await configorama(configFile, {
    returnMetadata: true,
    options: {
      stage: 'prod'
    }
  })

  deepLog('result', result)

})

test.run()