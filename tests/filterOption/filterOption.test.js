/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('Custom filter', async (t) => {
  const object = {
    foo: 'bar',
    key: '${opt:stage | addExclamation}'
  }

  const config = await configorama(object, {
    options: args,
    configDir: dirname, // needed for any file refs
    filters: {
      addExclamation: (val) => {
        return `${val}!`
      }
    }
  })

  t.is(config.key, 'dev!')
})
