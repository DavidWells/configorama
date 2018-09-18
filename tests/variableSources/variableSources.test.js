import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

const resolvedObject = {
  foo: 'bar',
  key: 'dev',
  value: 'dev-bar',
  env: '${consul:lol}'
}


test('Resolver', async (t) => {
  const object = {
    foo: 'bar',
    env: '${consul:${self:region}}',
    upTop: '${tester:abc}',
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

    other: 'lol',
    value: '${tester:xyz}',
    key: '${opt:stage}',
    // tester: '${ssm:/path/to/service/myParam}'
  }

  const vars = new Configorama(object, {
    configDir: dirname, // needed for any file refs
    variableSources: [{
      match: RegExp(/^consul:/g),
      resolver: (varToProcess, opts, currentObject) => {
        console.log('consul varToProcess', varToProcess)
        console.log('consul cli flags', opts)
        console.log('consul currentObject', currentObject)
        return Promise.resolve(varToProcess)
      }
    }]
  })

  const config = await vars.init(args)
  console.log(config)
  t.is('hi', 'hi')
})
