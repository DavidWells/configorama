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

test('Custom filter', async () => {
  const object = {
    foo: 'bar',
    key: '${opt:stage | addExclamation}'
  }

  const config = await configorama(object, {
    options: args,
    configDir: dirname,
    filters: {
      addExclamation: (val) => {
        return `${val}!`
      }
    }
  })

  assert.is(config.key, 'dev!')
})

test.run()
