/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('Custom variable source resolver', async (t) => {
  const object = {
    foo: 'bar',
    env: '${consul:${self:region}}',
    custom: {
      defaultStage: 'qa',
      profiles: {
        dev: 'devvvvvv',
        qa: 'qaaaaaaa',
        prod: 'prodddddd'
      },
      regions: {
        dev: 'us-dev',
        qa: 'us-qa',
        prod: 'us-prod'
      }
    },
    stage: '${opt:stage, self:custom.defaultStage}',
    profile: '${self:custom.profiles.${self:stage}}',
    region: '${opt:region, self:custom.regions.${self:stage}}',
    key: '${opt:stage}'
  }

  const config = await configorama(object, {
    configDir: dirname, // needed for any file refs
    options: args,
    variableSources: [{
      match: RegExp(/^consul:/g),
      resolver: (varToProcess, opts, currentObject) => {
        // console.log('consul varToProcess', varToProcess)
        // console.log('consul cli flags', opts)
        // console.log('consul currentObject', currentObject)
        return Promise.resolve(`fetch consul value ${varToProcess}`)
      }
    }]
  })
  // console.log(config)
  t.is(config.env, 'fetch consul value consul:us-dev')
})

test('Custom variable source resolver match function', async (t) => {
  const object = {
    tester: '${REPLACE_ME}'
  }

  const config = await configorama(object, {
    configDir: dirname, // needed for any file refs
    variableSources: [{
      match: (val) => {
        return val === 'REPLACE_ME'
      },
      resolver: (varToProcess, opts, currentObject) => {
        return Promise.resolve(`its replaced`)
      }
    }]
  })

  // console.log(config)
  t.is(config.tester, 'its replaced')
})
