/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../index')

function writeTempConfig(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-annotations-'))
  const configPath = path.join(dir, 'config.yml')
  fs.writeFileSync(configPath, lines.join('\n'))
  return { dir, configPath }
}

test('enriched metadata maps comment annotations onto occurrences', async () => {
  const { dir, configPath } = writeTempConfig([
    '# Stripe live secret key',
    '# @from Stripe dashboard > Developers > API keys',
    '# @example sk_live_...',
    '# @default Set in CI',
    '# @sensitive false',
    '# @group Payments',
    '# @deprecated Use STRIPE_RESTRICTED_KEY instead',
    'stripeSecret: ${env:STRIPE_SECRET_KEY}',
  ])

  try {
    const analysis = await configorama.analyze(configPath, { options: {} })
    const occurrence = analysis.uniqueVariables['env:STRIPE_SECRET_KEY'].occurrences[0]

    assert.is(occurrence.description, 'Stripe live secret key')
    assert.is(occurrence.descriptionSource, 'leadingComment')
    assert.is(occurrence.obtainHint, 'Stripe dashboard > Developers > API keys')
    assert.equal(occurrence.examples, ['sk_live_...'])
    assert.is(occurrence.defaultHint, 'Set in CI')
    assert.is(occurrence.defaultValue, undefined)
    assert.is(occurrence.sensitive, false)
    assert.is(occurrence.sensitiveSource, 'commentTag')
    assert.is(occurrence.group, 'Payments')
    assert.is(occurrence.deprecationMessage, 'Use STRIPE_RESTRICTED_KEY instead')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('enriched metadata lets @description override help on the same occurrence', async () => {
  const { dir, configPath } = writeTempConfig([
    '# Plain comment loses',
    '# @description Comment tag wins',
    'apiKey: ${env:CONFIGORAMA_ANNOTATED_API_KEY | help("Help loses")}',
  ])

  try {
    const analysis = await configorama.analyze(configPath, { options: {} })
    const occurrence = analysis.uniqueVariables['env:CONFIGORAMA_ANNOTATED_API_KEY'].occurrences[0]

    assert.is(occurrence.description, 'Comment tag wins')
    assert.is(occurrence.descriptionSource, 'commentTag')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('enriched metadata keeps normal comment below help while preserving independent tags', async () => {
  const { dir, configPath } = writeTempConfig([
    '# Plain comment loses to help',
    '# @from Dashboard > Tokens',
    'apiToken: ${env:CONFIGORAMA_ANNOTATED_TOKEN | help("Help wins")}',
  ])

  try {
    const analysis = await configorama.analyze(configPath, { options: {} })
    const occurrence = analysis.uniqueVariables['env:CONFIGORAMA_ANNOTATED_TOKEN'].occurrences[0]

    assert.is(occurrence.description, 'Help wins')
    assert.is(occurrence.descriptionSource, 'help')
    assert.is(occurrence.obtainHint, 'Dashboard > Tokens')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test.run()
