/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

test.cb('API is asynchronous', (t) => {
  let order = [
    'one'
  ]
  const configFile = path.join(__dirname, 'api.yml')
  const configorama = new Configorama(configFile)

  configorama.init({
    stage: 'dev',
  }).then((c) => {
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(c).length)
    console.log(c)
    console.log(`-------------`)
    order.push('three')
    t.deepEqual(order, ['one', 'two', 'three'])
    t.end()
  })
  order.push('two')
})

test('Allow unknown variables to pass through', async (t) => {
  const args = {
    stage: 'dev',
  }
  const object = {
    foo: 'bar',
    env: '${consul:${self:region}}',
    s3: '${s3:myBucket/myKey-${stage}}-hello',
    ssm: '${ssm:/path/to/service/id}-service',
    cloudformation: '${cf:another-stack.functionPrefix}-world',
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
    key: '${opt:stage}',
    whatever: '${stuff}'
  }

  const vars = new Configorama(object, {
    passThrough: true
  })

  const config = await vars.init(args)
  console.log(config)
  t.is(config.env, '${consul:us-dev}')
  t.is(config.s3, '${s3:myBucket/myKey-dev}-hello')
  t.is(config.ssm, '${ssm:/path/to/service/id}-service')
  t.is(config.cloudformation, '${cf:another-stack.functionPrefix}-world')
  t.is(config.whatever, '${stuff}')
})
