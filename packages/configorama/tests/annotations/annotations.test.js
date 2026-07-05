/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const configPath = path.join(__dirname, 'config.yml')

test('annotation fixture emits requirements metadata and ask fields', async () => {
  delete process.env.CONFIGORAMA_ANNOTATION_STRIPE_SECRET
  delete process.env.CONFIGORAMA_ANNOTATION_PUBLIC_KEY
  delete process.env.CONFIGORAMA_ANNOTATION_OWNER

  const result = await configorama.analyze(configPath, {
    instructions: true,
    options: {}
  })
  const byVariable = Object.fromEntries(result.requirements.map(req => [req.variable, req]))

  const stripe = byVariable['env:CONFIGORAMA_ANNOTATION_STRIPE_SECRET']
  assert.is(stripe.description, 'Stripe live secret key')
  assert.is(stripe.descriptionSource, 'leadingComment')
  assert.is(stripe.obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(stripe.examples, ['sk_live_...'])
  assert.is(stripe.defaultHint, 'Set in CI or local shell profile')
  assert.is(stripe.sensitive, true)
  assert.is(stripe.sensitiveSource, 'commentTag')
  assert.is(stripe.group, 'Payments')
  assert.is(stripe.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')

  const publicKey = byVariable['env:CONFIGORAMA_ANNOTATION_PUBLIC_KEY']
  assert.is(publicKey.sensitive, false)
  assert.is(publicKey.sensitiveSource, 'commentTag')

  const owner = byVariable['env:CONFIGORAMA_ANNOTATION_OWNER']
  assert.is(owner.description, 'Explicit description wins')
  assert.is(owner.descriptionSource, 'commentTag')

  const stripeAsk = result.ask.find(item => item.variable === 'env:CONFIGORAMA_ANNOTATION_STRIPE_SECRET')
  assert.is(stripeAsk.obtainHint, 'Stripe dashboard > Developers > API keys')
  assert.equal(stripeAsk.examples, ['sk_live_...'])
  assert.is(stripeAsk.defaultHint, 'Set in CI or local shell profile')
  assert.is(stripeAsk.group, 'Payments')
  assert.is(stripeAsk.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
  assert.is(Object.prototype.hasOwnProperty.call(stripeAsk, 'sensitiveSource'), false)
})

test.run()
