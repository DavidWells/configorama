/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('Custom filter', async () => {
  const object = {
    foo: 'bar',
    key: '${opt:stage | addExclamation }',
    keyTwo: '${"hi" | addExclamation}',
    envKey: '${env:envReference | addExclamation}'
  }

  const config = await configorama(object, {
    options: args,
    configDir: dirname,
    filters: {
      addExclamation: (val, from) => {
        // console.log('addExclamation', val, from)
        return `${val}!`
      }
    }
  })
  console.log('config', config)
  assert.is(config.key, 'dev!')
  assert.is(config.keyTwo, 'hi!')
  assert.is(config.envKey, 'env var!')
})

test.run()
