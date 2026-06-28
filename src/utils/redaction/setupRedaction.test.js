const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  REDACTED_VALUE,
  redactConfigByRequirements,
  redactUserInputsByRequirements,
} = require('./setupRedaction')

const requirements = [
  {
    name: 'API_KEY',
    variableType: 'env',
    sensitive: true,
    paths: ['secrets.apiKey'],
  },
  {
    name: 'PUBLIC_KEY',
    variableType: 'env',
    sensitive: false,
    paths: ['secrets.publicKey'],
  },
  {
    name: 'stage',
    variableType: 'option',
    sensitive: false,
    paths: ['stage'],
  },
]

test('redactUserInputsByRequirements redacts only sensitive setup values', () => {
  const inputs = {
    options: { stage: 'prod' },
    env: {
      API_KEY: 'secret-value',
      PUBLIC_KEY: 'public-value',
    }
  }

  assert.equal(redactUserInputsByRequirements(inputs, requirements), {
    options: { stage: 'prod' },
    env: {
      API_KEY: REDACTED_VALUE,
      PUBLIC_KEY: 'public-value',
    }
  })
  assert.is(inputs.env.API_KEY, 'secret-value')
})

test('redactConfigByRequirements redacts only sensitive resolved config paths', () => {
  const config = {
    stage: 'prod',
    secrets: {
      apiKey: 'secret-value',
      publicKey: 'public-value',
    }
  }

  assert.equal(redactConfigByRequirements(config, requirements), {
    stage: 'prod',
    secrets: {
      apiKey: REDACTED_VALUE,
      publicKey: 'public-value',
    }
  })
  assert.is(config.secrets.apiKey, 'secret-value')
})

test.run()
