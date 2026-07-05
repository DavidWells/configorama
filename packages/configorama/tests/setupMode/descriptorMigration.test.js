const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  createPromptMessage,
  descriptorToVarInfo,
  getAllowedValues,
  groupPromptDescriptorsForWizard,
  isVarInfoSensitive,
  validateType,
} = require('../../src/utils/ui/configWizard')

test('wizard groups ConfigRequirement-derived descriptors', () => {
  const grouped = groupPromptDescriptorsForWizard([
    {
      name: 'stage',
      variable: 'option:stage',
      variableType: 'option',
      group: 'options',
      type: 'string',
      required: true,
      defaultValue: null,
      allowedValues: ['dev', 'prod'],
      paths: ['stage'],
      conflicts: [],
    },
    {
      name: 'service',
      variable: 'self:service',
      variableType: 'self',
      group: 'self',
      type: 'string',
      required: false,
      defaultValue: 'api',
      paths: ['serviceRef'],
      conflicts: [],
    }
  ])

  assert.is(grouped.options.length, 1)
  assert.is(grouped.options[0].cleanName, 'stage')
  assert.equal(grouped.options[0].allowedValues, ['dev', 'prod'])
  assert.is(grouped.self.length, 0, 'resolved self refs should not prompt')
})

test('wizard adapter preserves conflict warnings as non-fatal metadata', () => {
  const varInfo = descriptorToVarInfo({
    name: 'stage',
    variable: 'option:stage',
    variableType: 'option',
    group: 'options',
    type: 'string',
    required: true,
    defaultValue: null,
    conflictWarning: 'type conflict at stage, provider.stage',
  })

  assert.is(varInfo.conflictWarning, 'type conflict at stage, provider.stage')
})

test('wizard adapter preserves annotation metadata and routes custom groups by variableType', () => {
  const grouped = groupPromptDescriptorsForWizard([
    {
      name: 'API_KEY',
      variable: 'env:API_KEY',
      variableType: 'env',
      group: 'Payments',
      type: 'string',
      required: true,
      sensitive: false,
      defaultValue: null,
      obtainHint: 'Stripe dashboard > Developers > API keys',
      examples: ['sk_live_...'],
      defaultHint: 'Set in CI',
      deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
      paths: ['apiKey'],
      conflicts: [],
    }
  ])

  assert.is(grouped.env.length, 1)
  assert.is(grouped.env[0].group, 'Payments')
  assert.is(grouped.env[0].sensitive, false)
  assert.is(grouped.env[0].obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(grouped.env[0].examples, ['sk_live_...'])
  assert.is(grouped.env[0].defaultHint, 'Set in CI')
  assert.is(grouped.env[0].deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
})

test('wizard prompt message includes actionable annotation metadata', () => {
  const message = createPromptMessage({
    cleanName: 'API_KEY',
    variableType: 'env',
    type: 'string',
    descriptions: ['Stripe live secret key'],
    obtainHint: 'Stripe dashboard > Developers > API keys',
    examples: ['sk_live_...'],
    defaultHint: 'Set in CI',
    group: 'Payments',
    deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
    occurrences: [
      {
        path: 'secrets.stripeSecret',
        originalString: '${env:API_KEY}',
      }
    ],
  })

  assert.match(message, /Stripe live secret key/)
  assert.match(message, /Group: Payments/)
  assert.match(message, /From: Stripe dashboard > Developers > API keys/)
  assert.match(message, /Example: sk_live_\.\.\./)
  assert.match(message, /Default hint: Set in CI/)
  assert.match(message, /Deprecated: Use STRIPE_RESTRICTED_KEY instead/)
})

test('wizard sensitivity helper honors descriptor override before name heuristic', () => {
  assert.is(isVarInfoSensitive({ cleanName: 'API_KEY', sensitive: false }), false)
  assert.is(isVarInfoSensitive({ cleanName: 'PUBLIC_VALUE', sensitive: true }), true)
  assert.is(isVarInfoSensitive({ cleanName: 'API_KEY' }), true)
})

test('wizard helpers consume descriptor allowedValues and lowercase types', () => {
  assert.equal(getAllowedValues({ allowedValues: ['dev', 'prod'] }), ['dev', 'prod'])
  assert.is(validateType('true', 'boolean'), undefined)
  assert.match(validateType('maybe', 'boolean'), /boolean/)
  assert.is(validateType('{"ok": true}', 'object'), undefined)
})

test.run()
