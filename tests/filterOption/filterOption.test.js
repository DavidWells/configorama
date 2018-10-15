/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

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

  const vars = new Configorama(object, {
    configDir: dirname, // needed for any file refs
    filters: {
      addExclamation: (val) => {
        return `${val}!`
      }
    }
  })

  const config = await vars.init(args)
  t.is(config.key, 'dev!')
})
