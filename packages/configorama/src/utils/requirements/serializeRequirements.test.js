/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../index')
const {
  getHow,
  serializeRequirements,
  shouldAsk,
} = require('./serializeRequirements')

test('serializeRequirements emits stable top-level contract', async () => {
  delete process.env.CONFIGORAMA_REQUIREMENTS_API_KEY
  const analysis = await configorama.analyze({
    apiKey: '${env:CONFIGORAMA_REQUIREMENTS_API_KEY | help("API key")}',
    stage: '${opt:stage}',
    region: '${env:CONFIGORAMA_REQUIREMENTS_REGION, "us-east-1"}',
  }, { options: {} })

  const result = serializeRequirements(analysis, { configPathOrObject: null })

  assert.is(result.schemaVersion, 1)
  assert.is(result.config, null)
  assert.equal(result.summary, {
    total: 3,
    required: 2,
    optional: 1,
    sensitive: 1,
  })
  assert.equal(result.ask.map(item => item.variable), [
    'env:CONFIGORAMA_REQUIREMENTS_API_KEY',
    'opt:stage',
  ])
  assert.equal(result.ask.map(item => item.how), [
    'Set environment variable CONFIGORAMA_REQUIREMENTS_API_KEY',
    'Pass --stage on the CLI',
  ])
})

test('analyze instructions mode returns requirements JSON', async () => {
  delete process.env.CONFIGORAMA_REQUIREMENTS_TOKEN
  const result = await configorama.analyze({
    token: '${env:CONFIGORAMA_REQUIREMENTS_TOKEN}',
  }, {
    instructions: true,
  })

  assert.is(result.schemaVersion, 1)
  assert.is(result.summary.total, 1)
  assert.equal(result.ask.map(item => item.variable), ['env:CONFIGORAMA_REQUIREMENTS_TOKEN'])
})

test('ask is environment-aware for env variables', async () => {
  const envName = 'CONFIGORAMA_REQUIREMENTS_PRESENT'
  const previous = process.env[envName]
  process.env[envName] = 'available'

  try {
    const result = await configorama.analyze({
      present: '${env:CONFIGORAMA_REQUIREMENTS_PRESENT}',
    }, {
      instructions: true,
    })

    assert.equal(result.ask, [])
    assert.is(result.requirements[0].default, 'available')
    assert.is(result.requirements[0].required, false)
  } finally {
    if (previous === undefined) delete process.env[envName]
    else process.env[envName] = previous
  }
})

test('ask includes concrete missing files and excludes dynamic unresolved files', () => {
  const result = serializeRequirements({
    uniqueVariables: {
      'file(./missing.yml)': {
        variable: 'file(./missing.yml)',
        variableType: 'file',
        variableSourceType: 'config',
        fileExists: false,
        occurrences: [{ path: 'config', isRequired: true }]
      },
      'file(./missing-${opt:stage}.yml)': {
        variable: 'file(./missing-${opt:stage}.yml)',
        variableType: 'file',
        variableSourceType: 'config',
        innerVariables: [{ variable: 'opt:stage' }],
        occurrences: [{ path: 'dynamicConfig', isRequired: true }]
      }
    }
  })

  assert.equal(result.ask.map(item => item.variable), ['file(./missing.yml)'])
  assert.is(result.ask[0].how, 'Provide file at path ./missing.yml')
})

test('how strings are derived from variableType', () => {
  assert.is(getHow({ variableType: 'env', name: 'TOKEN' }), 'Set environment variable TOKEN')
  assert.is(getHow({ variableType: 'option', name: 'stage' }), 'Pass --stage on the CLI')
  assert.is(getHow({ variableType: 'param', name: 'domain' }), 'Pass --param domain=<value>')
  assert.is(getHow({ variableType: 'file', name: './secrets.yml' }), 'Provide file at path ./secrets.yml')
  assert.is(getHow({ variableType: 'git', name: 'sha' }), null)
})

test('readonly derived sources are excluded from ask', () => {
  assert.is(shouldAsk({
    variableType: 'git',
    required: true,
    default: null,
    sourceClass: 'config',
  }), false)
})

test('serializer hard-errors on model conflicts', () => {
  assert.throws(() => serializeRequirements({
    uniqueVariables: {
      'opt:stage': {
        variable: 'opt:stage',
        variableType: 'options',
        variableSourceType: 'user',
        occurrences: [
          { path: 'stage', type: 'String', isRequired: true },
          { path: 'provider.stage', type: 'Number', isRequired: true },
        ]
      }
    }
  }), /opt:stage type conflict at stage, provider.stage/)
})

test('serializeRequirements includes annotation fields in requirements and ask', () => {
  const result = serializeRequirements({
    uniqueVariables: {
      'env:STRIPE_SECRET_KEY': {
        variable: 'env:STRIPE_SECRET_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'secrets.stripeSecret',
            description: 'Stripe live secret key',
            descriptionSource: 'commentTag',
            obtainHint: 'Stripe dashboard > Developers > API keys',
            examples: ['sk_live_...'],
            defaultHint: 'Set in CI',
            group: 'Payments',
            deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
            sensitive: true,
            sensitiveSource: 'commentTag',
            isRequired: true,
          }
        ]
      }
    }
  })

  const requirement = result.requirements[0]
  assert.is(requirement.description, 'Stripe live secret key')
  assert.is(requirement.descriptionSource, 'commentTag')
  assert.is(requirement.obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(requirement.examples, ['sk_live_...'])
  assert.is(requirement.defaultHint, 'Set in CI')
  assert.is(requirement.group, 'Payments')
  assert.is(requirement.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
  assert.is(requirement.sensitive, true)
  assert.is(requirement.sensitiveSource, 'commentTag')

  assert.equal(result.ask, [
    {
      name: 'STRIPE_SECRET_KEY',
      variable: 'env:STRIPE_SECRET_KEY',
      variableType: 'env',
      type: 'string',
      sensitive: true,
      description: 'Stripe live secret key',
      obtainHint: 'Stripe dashboard > Developers > API keys',
      examples: ['sk_live_...'],
      defaultHint: 'Set in CI',
      group: 'Payments',
      deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
      paths: ['secrets.stripeSecret'],
      how: 'Set environment variable STRIPE_SECRET_KEY',
    }
  ])
  assert.is(Object.prototype.hasOwnProperty.call(result.ask[0], 'sensitiveSource'), false)
})

test('serializer hard-errors on annotation conflicts', () => {
  assert.throws(() => serializeRequirements({
    uniqueVariables: {
      'env:PAYMENT_TOKEN': {
        variable: 'env:PAYMENT_TOKEN',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'stripe.token',
            obtainHint: 'Stripe dashboard',
            isRequired: true,
          },
          {
            path: 'github.token',
            obtainHint: 'GitHub settings',
            isRequired: true,
          },
        ]
      }
    }
  }), /env:PAYMENT_TOKEN obtainHint conflict at stripe.token, github.token: "Stripe dashboard", "GitHub settings"/)
})

test.run()
