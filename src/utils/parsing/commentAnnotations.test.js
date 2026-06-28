const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { parseCommentAnnotations, parseSensitive } = require('./commentAnnotations')

test('parseCommentAnnotations parses supported tags into normalized annotation fields', () => {
  const result = parseCommentAnnotations([
    '@description Stripe live secret key',
    '@from Stripe dashboard > Developers > API keys',
    '@example sk_live_...',
    '@default Set this in CI',
    '@sensitive true',
    '@group Payments',
    '@deprecated Use STRIPE_RESTRICTED_KEY instead',
  ])

  assert.equal(result.tags, {
    description: ['Stripe live secret key'],
    from: ['Stripe dashboard > Developers > API keys'],
    example: ['sk_live_...'],
    default: ['Set this in CI'],
    sensitive: ['true'],
    group: ['Payments'],
    deprecated: ['Use STRIPE_RESTRICTED_KEY instead'],
  })
  assert.equal(result.annotations, {
    description: 'Stripe live secret key',
    obtainHint: 'Stripe dashboard > Developers > API keys',
    examples: ['sk_live_...'],
    defaultHint: 'Set this in CI',
    sensitive: true,
    group: 'Payments',
    deprecationMessage: 'Use STRIPE_RESTRICTED_KEY instead',
  })
  assert.is(result.description, 'Stripe live secret key')
  assert.is(result.descriptionSource, 'commentTag')
})

test('parseCommentAnnotations keeps plain text separate from tag lines', () => {
  const result = parseCommentAnnotations([
    'Stripe live secret key',
    '@from Stripe dashboard > Developers > API keys',
  ])

  assert.is(result.plainText, 'Stripe live secret key')
  assert.is(result.description, 'Stripe live secret key')
  assert.is(result.descriptionSource, null)
  assert.equal(result.annotations, {
    obtainHint: 'Stripe dashboard > Developers > API keys',
  })
})

test('parseCommentAnnotations treats unknown tag-shaped lines as plain description text', () => {
  const result = parseCommentAnnotations([
    '@david rotate this key after launch',
    'ping @ops before rotating this key',
  ])

  assert.is(result.plainText, '@david rotate this key after launch ping @ops before rotating this key')
  assert.is(result.description, '@david rotate this key after launch ping @ops before rotating this key')
  assert.equal(result.tags, {})
  assert.equal(result.annotations, {})
})

test('parseCommentAnnotations preserves empty tag values in raw tags and omits normalized empty fields', () => {
  const result = parseCommentAnnotations([
    '@from',
    '@default ',
    '@group Platform',
  ])

  assert.equal(result.tags, {
    from: [''],
    default: [''],
    group: ['Platform'],
  })
  assert.equal(result.annotations, {
    group: 'Platform',
  })
})

test('parseCommentAnnotations joins repeated descriptions and dedupes examples', () => {
  const result = parseCommentAnnotations([
    '@description Stripe live',
    '@description secret key',
    '@example sk_live_...',
    '@example sk_live_...',
    '@example stripe-key',
  ])

  assert.is(result.annotations.description, 'Stripe live secret key')
  assert.equal(result.annotations.examples, ['sk_live_...', 'stripe-key'])
})

test('parseSensitive accepts only true and false case-insensitively', () => {
  assert.is(parseSensitive('true'), true)
  assert.is(parseSensitive('TRUE'), true)
  assert.is(parseSensitive('false'), false)
  assert.is(parseSensitive('False'), false)
  assert.is(parseSensitive('yes'), undefined)
  assert.is(parseSensitive('1'), undefined)
  assert.is(parseSensitive(''), undefined)
})

test('parseCommentAnnotations ignores invalid sensitive values so heuristics can apply later', () => {
  const result = parseCommentAnnotations([
    '@sensitive yes',
    '@description API token',
  ])

  assert.equal(result.tags.sensitive, ['yes'])
  assert.equal(result.annotations, {
    description: 'API token',
  })
})

test('comment annotation parser does not require jsdoc-parser', () => {
  const source = fs.readFileSync(path.join(__dirname, 'commentAnnotations.js'), 'utf8')
  assert.not.match(source, /jsdoc-parser|doxxx|jsdoctypeparser/)
})

test.run()
