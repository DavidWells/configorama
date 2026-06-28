/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../index')
const {
  buildConfigRequirements,
  cleanDefaultValue,
  normalizeType,
  normalizeVariableType,
} = require('./configRequirements')

test('normalizeVariableType maps option resolver variants to option', () => {
  assert.is(normalizeVariableType('options'), 'option')
  assert.is(normalizeVariableType('opt'), 'option')
  assert.is(normalizeVariableType('option'), 'option')
  assert.is(normalizeVariableType('dot.prop'), 'dotProp')
})

test('normalizeType defaults to string and lowers known type filters', () => {
  assert.is(normalizeType(), 'string')
  assert.is(normalizeType('String'), 'string')
  assert.is(normalizeType('Number'), 'number')
  assert.is(normalizeType('Boolean'), 'boolean')
  assert.is(normalizeType('Json'), 'json')
  assert.is(normalizeType('Array'), 'array')
  assert.is(normalizeType('Object'), 'object')
})

test('cleanDefaultValue strips only matching surrounding quotes', () => {
  assert.is(cleanDefaultValue('"fallback-value"'), 'fallback-value')
  assert.is(cleanDefaultValue("'fallback-value'"), 'fallback-value')
  assert.is(cleanDefaultValue('5432'), '5432')
  assert.is(cleanDefaultValue(5432), 5432)
  assert.is(cleanDefaultValue(undefined), null)
})

test('buildConfigRequirements normalizes analyze uniqueVariables', async () => {
  const analysis = await configorama.analyze({
    apiKey: '${env:API_KEY | String | help("API key secret")}',
    port: '${env:DB_PORT, 5432 | Number | help("Database port")}',
    stage: '${opt:stage | help("Deployment stage")}',
    otherStage: '${opt:stage, "dev"}',
    selfRef: '${self:serviceName}',
    serviceName: 'demo',
    dotRef: '${missing.path | Boolean}',
  }, {
    options: {}
  })

  const requirements = buildConfigRequirements(analysis)
  const byVariable = Object.fromEntries(requirements.map(req => [req.variable, req]))

  assert.is(byVariable['env:API_KEY'].name, 'API_KEY')
  assert.is(byVariable['env:API_KEY'].variableType, 'env')
  assert.is(byVariable['env:API_KEY'].sourceClass, 'user')
  assert.is(byVariable['env:API_KEY'].type, 'string')
  assert.is(byVariable['env:API_KEY'].description, 'API key secret')
  assert.is(byVariable['env:API_KEY'].descriptionSource, 'help')
  assert.is(byVariable['env:API_KEY'].sensitive, true)
  assert.is(byVariable['env:API_KEY'].required, true)
  assert.equal(byVariable['env:API_KEY'].paths, ['apiKey'])

  assert.is(byVariable['env:DB_PORT'].type, 'number')
  assert.is(byVariable['env:DB_PORT'].default, '5432')
  assert.is(byVariable['env:DB_PORT'].required, false)

  assert.is(byVariable['opt:stage'].name, 'stage')
  assert.is(byVariable['opt:stage'].variableType, 'option')
  assert.is(byVariable['opt:stage'].sourceClass, 'user')
  assert.equal(byVariable['opt:stage'].paths, ['stage', 'otherStage'])
  assert.is(byVariable['opt:stage'].default, 'dev')

  assert.is(byVariable['self:serviceName'].name, 'serviceName')
  assert.is(byVariable['self:serviceName'].variableType, 'self')
  assert.is(byVariable['self:serviceName'].sourceClass, 'config')
  assert.is(byVariable['self:serviceName'].default, 'demo')

  assert.is(byVariable['missing.path'].variableType, 'dotProp')
  assert.is(byVariable['missing.path'].type, 'boolean')
})

test('buildConfigRequirements carries file variables and paths', () => {
  const requirements = buildConfigRequirements({
    uniqueVariables: {
      'file(./missing.yml)': {
        variable: 'file(./missing.yml)',
        variableType: 'file',
        variableSourceType: 'config',
        fileExists: false,
        occurrences: [
          {
            path: 'config',
            isRequired: true,
          }
        ]
      }
    }
  })

  assert.is(requirements.length, 1)
  assert.is(requirements[0].name, './missing.yml')
  assert.is(requirements[0].variableType, 'file')
  assert.is(requirements[0].sourceClass, 'config')
  assert.equal(requirements[0].paths, ['config'])
  assert.is(requirements[0].type, 'string')
  assert.is(requirements[0].required, true)
})

test('buildConfigRequirements leaves identical annotations conflict-free', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'opt:stage': {
        variable: 'opt:stage',
        variableType: 'options',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'stage',
            type: 'String',
            defaultValue: '"dev"',
            allowedValues: ['dev', 'prod'],
            isRequired: false,
          },
          {
            path: 'provider.stage',
            type: 'String',
            defaultValue: 'dev',
            allowedValues: ['prod', 'dev'],
            isRequired: false,
          }
        ]
      }
    }
  })

  assert.equal(requirement.conflicts, [])
  assert.is(requirement.type, 'string')
  assert.is(requirement.default, 'dev')
  assert.equal(requirement.allowedValues, ['dev', 'prod'])
})

test('buildConfigRequirements records type/default/allowedValues conflicts', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'opt:stage': {
        variable: 'opt:stage',
        variableType: 'options',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'stage',
            type: 'String',
            defaultValue: 'dev',
            allowedValues: ['dev', 'prod'],
            isRequired: false,
          },
          {
            path: 'provider.stage',
            type: 'Number',
            defaultValue: '1',
            allowedValues: ['1', '2'],
            isRequired: false,
          }
        ]
      }
    }
  })

  const byField = Object.fromEntries(requirement.conflicts.map(conflict => [conflict.field, conflict]))
  assert.ok(byField.type)
  assert.equal(byField.type.paths, ['stage', 'provider.stage'])
  assert.equal(byField.type.values.map(item => item.value), ['string', 'number'])

  assert.ok(byField.default)
  assert.equal(byField.default.paths, ['stage', 'provider.stage'])
  assert.equal(byField.default.values.map(item => item.value), ['dev', '1'])

  assert.ok(byField.allowedValues)
  assert.equal(byField.allowedValues.paths, ['stage', 'provider.stage'])
  assert.equal(byField.allowedValues.values.map(item => item.value), [['dev', 'prod'], ['1', '2']])
})

test('buildConfigRequirements selects descriptions by precedence without conflicts', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'env:API_KEY': {
        variable: 'env:API_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'apiKey',
            description: 'Comment description',
            descriptionSource: 'comment',
            isRequired: true,
          },
          {
            path: 'apiKey',
            description: 'Help description',
            descriptionSource: 'help',
            isRequired: true,
          }
        ]
      }
    }
  })

  assert.is(requirement.description, 'Help description')
  assert.is(requirement.descriptionSource, 'help')
  assert.equal(requirement.conflicts, [])
  assert.is(requirement.sensitive, true)
})

test('buildConfigRequirements gives @description commentTag priority over help', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'env:API_KEY': {
        variable: 'env:API_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'apiKey',
            description: 'Help description',
            descriptionSource: 'help',
            isRequired: true,
          },
          {
            path: 'apiKey',
            description: 'Comment tag description',
            descriptionSource: 'commentTag',
            isRequired: true,
          }
        ]
      }
    }
  })

  assert.is(requirement.description, 'Comment tag description')
  assert.is(requirement.descriptionSource, 'commentTag')
})

test('buildConfigRequirements merges annotation fields and unique examples', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'env:STRIPE_SECRET_KEY': {
        variable: 'env:STRIPE_SECRET_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'secrets.stripeSecret',
            obtainHint: 'Stripe dashboard > Developers > API keys',
            examples: ['sk_live_...', 'stripe-key'],
            defaultHint: 'Set in CI',
            group: 'Payments',
            deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
            sensitive: false,
            sensitiveSource: 'commentTag',
            isRequired: true,
          },
          {
            path: 'env.STRIPE_SECRET_KEY',
            obtainHint: 'Stripe dashboard > Developers > API keys',
            examples: ['sk_live_...'],
            defaultHint: 'Set in CI',
            group: 'Payments',
            deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
            sensitive: false,
            sensitiveSource: 'commentTag',
            isRequired: true,
          }
        ]
      }
    }
  })

  assert.is(requirement.obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(requirement.examples, ['sk_live_...', 'stripe-key'])
  assert.is(requirement.defaultHint, 'Set in CI')
  assert.is(requirement.group, 'Payments')
  assert.is(requirement.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
  assert.is(requirement.sensitive, false)
  assert.is(requirement.sensitiveSource, 'commentTag')
  assert.equal(requirement.conflicts, [])
})

test('buildConfigRequirements records scalar annotation conflicts', () => {
  const [requirement] = buildConfigRequirements({
    uniqueVariables: {
      'env:PAYMENT_TOKEN': {
        variable: 'env:PAYMENT_TOKEN',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'stripe.token',
            obtainHint: 'Stripe dashboard',
            defaultHint: 'Set in CI',
            group: 'Payments',
            deprecationMessage: 'Use restricted key',
            sensitive: true,
            isRequired: true,
          },
          {
            path: 'github.token',
            obtainHint: 'GitHub settings',
            defaultHint: 'Set locally',
            group: 'Source Control',
            deprecationMessage: 'Use fine-grained token',
            sensitive: false,
            isRequired: true,
          }
        ]
      }
    }
  })

  const byField = Object.fromEntries(requirement.conflicts.map(conflict => [conflict.field, conflict]))
  assert.equal(byField.obtainHint.paths, ['stripe.token', 'github.token'])
  assert.equal(byField.obtainHint.values.map(item => item.value), ['Stripe dashboard', 'GitHub settings'])
  assert.equal(byField.defaultHint.values.map(item => item.value), ['Set in CI', 'Set locally'])
  assert.equal(byField.group.values.map(item => item.value), ['Payments', 'Source Control'])
  assert.equal(byField.deprecationMessage.values.map(item => item.value), ['Use restricted key', 'Use fine-grained token'])
  assert.equal(byField.sensitive.values.map(item => item.value), [true, false])
})

test('buildConfigRequirements applies sensitive overrides and falls back to name heuristic when absent', () => {
  const requirements = buildConfigRequirements({
    uniqueVariables: {
      'env:API_KEY': {
        variable: 'env:API_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'apiKey',
            sensitive: false,
            sensitiveSource: 'commentTag',
            isRequired: true,
          }
        ]
      },
      'env:PUBLIC_VALUE': {
        variable: 'env:PUBLIC_VALUE',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'publicValue',
            sensitive: true,
            sensitiveSource: 'commentTag',
            isRequired: true,
          }
        ]
      },
      'env:AUTH_TOKEN': {
        variable: 'env:AUTH_TOKEN',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [
          {
            path: 'authToken',
            isRequired: true,
          }
        ]
      }
    }
  })
  const byVariable = Object.fromEntries(requirements.map(req => [req.variable, req]))

  assert.is(byVariable['env:API_KEY'].sensitive, false)
  assert.is(byVariable['env:API_KEY'].sensitiveSource, 'commentTag')
  assert.is(byVariable['env:PUBLIC_VALUE'].sensitive, true)
  assert.is(byVariable['env:PUBLIC_VALUE'].sensitiveSource, 'commentTag')
  assert.is(byVariable['env:AUTH_TOKEN'].sensitive, true)
  assert.is(byVariable['env:AUTH_TOKEN'].sensitiveSource, null)
})

test.run()
