const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  createPromptDescriptor,
  createPromptDescriptors,
  groupRequirementsForWizard,
  normalizePromptValue,
  selectPromptType,
  stripPromptQuotes,
  validatePromptValue,
} = require('./promptDescriptors')

function req(overrides) {
  return {
    name: 'stage',
    variable: 'option:stage',
    variableType: 'option',
    type: 'string',
    required: true,
    sensitive: false,
    description: null,
    default: null,
    allowedValues: null,
    paths: ['stage'],
    conflicts: [],
    ...overrides,
  }
}

test('groupRequirementsForWizard maps requirements to wizard groups', () => {
  const grouped = groupRequirementsForWizard([
    req({ variableType: 'option' }),
    req({ variableType: 'env' }),
    req({ variableType: 'self' }),
    req({ variableType: 'dotProp' }),
    req({ variableType: 'file' }),
  ])

  assert.is(grouped.options.length, 1)
  assert.is(grouped.env.length, 1)
  assert.is(grouped.self.length, 1)
  assert.is(grouped.dotProp.length, 1)
  assert.is(grouped.files.length, 1)
})

test('groupRequirementsForWizard supports annotation display groups', () => {
  const grouped = groupRequirementsForWizard([
    req({ variableType: 'env', group: 'Payments' }),
  ])

  assert.is(grouped.Payments.length, 1)
  assert.is(grouped.env.length, 0)
})

test('selectPromptType covers sensitivity, enum, boolean, array, and text modes', () => {
  assert.is(selectPromptType(req({ sensitive: true })), 'password')
  assert.is(selectPromptType(req({ allowedValues: ['dev', 'prod'] })), 'select')
  assert.is(selectPromptType(req({ type: 'array', allowedValues: ['a', 'b'] })), 'multiselect')
  assert.is(selectPromptType(req({ type: 'boolean' })), 'confirm')
  assert.is(selectPromptType(req({ type: 'object' })), 'text')
  assert.is(selectPromptType(req({ type: 'json' })), 'text')
})

test('createPromptDescriptor strips quoted defaults and reads current env values', () => {
  const envName = 'CONFIGORAMA_DESCRIPTOR_ENV'
  const previous = process.env[envName]
  process.env[envName] = 'from-env'

  try {
    const optionDescriptor = createPromptDescriptor(req({
      default: '"dev"',
    }))
    assert.is(optionDescriptor.defaultValue, 'dev')
    assert.is(optionDescriptor.placeholder, 'dev')

    const envDescriptor = createPromptDescriptor(req({
      name: envName,
      variable: `env:${envName}`,
      variableType: 'env',
      default: null,
    }))
    assert.is(envDescriptor.defaultValue, 'from-env')
    assert.is(envDescriptor.placeholder, 'from-env')
  } finally {
    if (previous === undefined) delete process.env[envName]
    else process.env[envName] = previous
  }
})

test('createPromptDescriptor includes conflict warning metadata without throwing', () => {
  const descriptor = createPromptDescriptor(req({
    conflicts: [
      { field: 'type', paths: ['stage', 'provider.stage'], values: [] }
    ]
  }))

  assert.equal(descriptor.conflicts, [
    { field: 'type', paths: ['stage', 'provider.stage'], values: [] }
  ])
  assert.is(descriptor.conflictWarning, 'type conflict at stage, provider.stage')
})

test('createPromptDescriptor carries annotation metadata without changing runtime defaults', () => {
  const descriptor = createPromptDescriptor(req({
    name: 'API_KEY',
    variable: 'env:API_KEY',
    variableType: 'env',
    group: 'Payments',
    sensitive: false,
    obtainHint: 'Stripe dashboard > Developers > API keys',
    examples: ['sk_live_...'],
    defaultHint: 'Set in CI',
    deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
    default: null,
  }))

  assert.is(descriptor.group, 'Payments')
  assert.is(descriptor.sensitive, false)
  assert.is(descriptor.promptType, 'text')
  assert.is(descriptor.obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(descriptor.examples, ['sk_live_...'])
  assert.is(descriptor.defaultHint, 'Set in CI')
  assert.is(descriptor.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
  assert.is(descriptor.defaultValue, null)
  assert.is(descriptor.placeholder, 'Enter environment variable for API_KEY')
})

test('createPromptDescriptor uses sensitive override for prompt type', () => {
  assert.is(createPromptDescriptor(req({ name: 'PUBLIC_VALUE', sensitive: true })).promptType, 'password')
  assert.is(createPromptDescriptor(req({ name: 'API_KEY', sensitive: false })).promptType, 'text')
})

test('normalizePromptValue coerces descriptor values', () => {
  assert.is(stripPromptQuotes("'dev'"), 'dev')
  assert.is(normalizePromptValue('4', { type: 'number' }), 4)
  assert.is(normalizePromptValue('yes', { type: 'boolean' }), true)
  assert.equal(normalizePromptValue('a, b,c', { type: 'array' }), ['a', 'b', 'c'])
  assert.equal(normalizePromptValue('{"a":1}', { type: 'object' }), { a: 1 })
  assert.is(normalizePromptValue('', { type: 'string', defaultValue: 'fallback' }), 'fallback')
})

test('validatePromptValue validates required, allowed, number, boolean, and JSON values', () => {
  assert.is(validatePromptValue('', { required: true, type: 'string' }), 'This value is required')
  assert.match(validatePromptValue('qa', { type: 'string', allowedValues: ['dev', 'prod'] }), /Must be one of/)
  assert.match(validatePromptValue('abc', { type: 'number' }), /valid number/)
  assert.match(validatePromptValue('maybe', { type: 'boolean' }), /boolean/)
  assert.match(validatePromptValue('{bad', { type: 'json' }), /valid JSON/)
  assert.is(validatePromptValue('{"ok":true}', { type: 'json' }), undefined)
})

test('createPromptDescriptors returns serializable prompt decisions plus pure helpers', () => {
  const descriptors = createPromptDescriptors([
    req({ allowedValues: ['dev', 'prod'] }),
  ])

  assert.is(descriptors.length, 1)
  assert.is(descriptors[0].promptType, 'select')
  assert.is(descriptors[0].validate('dev'), undefined)
  assert.is(descriptors[0].normalize('prod'), 'prod')
})

test.run()
