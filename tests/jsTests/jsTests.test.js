/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envNumber = 100

const args = {
  stage: 'dev',
  otherFlag: 'prod',
  count: 25
  // empty: 'HEHEHE'
}

test('JS config file returning object resolves correctly', async (t) => {
  const configFile = path.join(__dirname, 'js-object-config.js')
  const config = await configorama(configFile, {
    options: args
  })
  t.is(config.my, 'config')
  t.is(config.flag, 'dev')
})

test('JS config file returning function resolves correctly', async (t) => {
  const configFile = path.join(__dirname, 'js-function-config.js')
  const config = await configorama(configFile, {
    options: args
  })
  t.is(config.my, 'config')
  t.is(config.flag, 'dev')
})

test('JS config file with dynamicArgs object', async (t) => {
  const configFile = path.join(__dirname, 'js-function-config-with-options.js')
  const config = await configorama(configFile, {
    options: args,
    dynamicArgs: {
      foo: 'one',
      bar: 'two'
    }
  })
  t.is(config.one, 'one')
  t.is(config.two, 'two')
})

test('JS config file with dynamicArgs function', async (t) => {
  const configFile = path.join(__dirname, 'js-function-config-with-options.js')
  const config = await configorama(configFile, {
    options: args,
    dynamicArgs: () => {
      return {
        foo: 'one',
        bar: 'two'
      }
    }
  })
  t.is(config.one, 'one')
  t.is(config.two, 'two')
})
