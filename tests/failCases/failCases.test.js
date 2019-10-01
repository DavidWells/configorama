/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('throw if self not found', async (t) => {
  const object = {
    value: '${opt:stage}-${foo}',
  }

  const error = await t.throwsAsync(async () => {
    const x = await configorama(object, {
      configDir: dirname
    })
    return x
  })
  // const error = await t.throws(vars.init(args))
  // t.is(error.message, 'Invalid variable reference syntax for variable "foo" ${opt:stage}-${foo}')
  t.regex(error.message, /Invalid variable reference syntax/)
})

test('throw if opt not found', async (t) => {
  const object = {
    value: '${opt:what}',
  }

  const error = await t.throwsAsync(async () => {
    const x = await configorama(object, {
      configDir: dirname
    })
    return x
  })
  t.regex(error.message, /Variable not found/)
})

test('throw if value resolved is undefined', async (t) => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  const error = await t.throwsAsync(async () => {
    const x = await configorama(object, {
      configDir: dirname
    })
    return x
  })
  t.regex(error.message, /Please verify the variable/)
})

test('Allow undefined values', async (t) => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  const x = await configorama(object, {
    configDir: dirname,
    allowUndefinedValues: true
  })
  t.is(x.value, undefined)
})

// Nested fallbacks ACCESS_TOKEN = "${file(asyncValue.js, ${env:MY_SECxRET, 'hi'}, ${self:sharedValue})}"
