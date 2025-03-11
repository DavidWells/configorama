/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

let config

process.env.envReference = 'env var'

test('fallbackTest', async () => {
  const configFile = path.join(__dirname, 'fallback.yml')
  const newConfig = await configorama(configFile)
  console.log('newConfig', newConfig)
  assert.is(newConfig.fooInCaps, 'FOO BAR')
  assert.is(newConfig.fooInLowerCase, 'foo bar')
  assert.is(newConfig.fooInCapitalize, 'Foo bar')
  assert.is(newConfig.fooInCamelCase, 'fooBar')
  assert.is(newConfig.fooInKebabCase, 'foo-bar')

})

test.run()
