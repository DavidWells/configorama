/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let order = ['one']

test('API is asynchronous', async () => {
  const configFile = path.join(__dirname, 'api.yml')

  const config = configorama(configFile, {
    options: {
      stage: 'dev',
    }
  }).then((c) => {
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(c).length)
    console.log(c)
    console.log(`-------------`)
    order.push('three')
    console.log('order', order)
    assert.equal(order, ['one', 'two', 'three'])
  })
  order.push('two')
})

test('Allow unknown variables to pass through', async () => {
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

  const config = await configorama(object, {
    allowUnknownVars: true,
    options: args
  })

  assert.is(config.env, '${consul:us-dev}')
  assert.is(config.s3, '${s3:myBucket/myKey-dev}-hello')
  assert.is(config.ssm, '${ssm:/path/to/service/id}-service')
  assert.is(config.cloudformation, '${cf:another-stack.functionPrefix}-world')
  assert.is(config.whatever, '${stuff}')
})

test('Allow unknown variables to pass through with postfixes', async () => {
  const args = {
    stage: 'dev',
  }
  const object = {
    foo: 'bar',
    s3: '${s3:myBucket/myKey-${stage}}-hello',
    stage: '${opt:stage, self:custom.defaultStage}',
  }

  const config = await configorama(object, {
    allowUnknownVars: true,
    options: args
  })
  assert.is(config.s3, '${s3:myBucket/myKey-dev}-hello')
})

test('Allow unknown variables', async () => {
  const args = {
    stage: 'dev',
  }
  const object = {
    "provider": {
      "stage": "dev"
    },
    "custom": {
      "honeycomb": {
        "dev": {
          "dataset": "${ssm:/honeycomb/dataset}"
        },
        "staging": {
          "dataset": "staging-share-backend"
        },
        "prod": {
          "dataset": "prod-share-backend"
        }
      },
      "honeycombDataset": "${self:custom.honeycomb.${self:provider.stage}.dataset}",
      "honeycombWriteKey": "foo"
    },
    "environment": {
      "HONEYCOMB_DATASET": "${self:custom.honeycombDataset}",
      "HONEYCOMB_WRITE_KEY": "${self:custom.honeycombWriteKey}",
      "OTEL_EXPORTER_OTLP_HEADERS": "x-honeycomb-dataset=${self:custom.honeycombDataset},x-honeycomb-team=${self:custom.honeycombWriteKey}"
    }
  }

  const config = await configorama(object, {
    allowUnknownVars: true,
    options: args
  })
  assert.equal(config, {
    provider: { stage: 'dev' },
    custom: {
      honeycomb: {
        dev: { dataset: '${ssm:/honeycomb/dataset}' },
        staging: { dataset: 'staging-share-backend' },
        prod: { dataset: 'prod-share-backend' }
      },
      honeycombDataset: '${ssm:/honeycomb/dataset}',
      honeycombWriteKey: 'foo'
    },
    environment: {
      HONEYCOMB_DATASET: '${ssm:/honeycomb/dataset}',
      HONEYCOMB_WRITE_KEY: 'foo',
      OTEL_EXPORTER_OTLP_HEADERS: 'x-honeycomb-dataset=${ssm:/honeycomb/dataset},x-honeycomb-team=foo'
    }
  })
})

test.run()
