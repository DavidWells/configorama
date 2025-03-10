/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('throw if self not found', async () => {
  const object = {
    value: '${opt:stage}-${foo}',
  }

  try {
    await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Invalid variable reference syntax/)
  }
})

test('throw if opt not found', async () => {
  const object = {
    value: '${opt:what}',
  }

  try {
    await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    console.log('error', error)
    assert.match(error.message, /Unable to resolve variable/)
  }
})

test('throw if deep value not found', async () => {
  const configFile = path.join(__dirname, 'fail.yml')

  try {
    await configorama(configFile)
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Missing Value/)
  }
})

test('throw if value resolved is undefined', async () => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  try {
    await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /resolved to "undefined"/)
  }
})

test('Allow undefined values', async () => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  const x = await configorama(object, {
    configDir: dirname,
    allowUndefinedValues: true
  })
  assert.is(x.value, undefined)
})

// Nested fallbacks ACCESS_TOKEN = "${file(asyncValue.js, ${env:MY_SECxRET, 'hi'}, ${self:sharedValue})}"

test.run()
