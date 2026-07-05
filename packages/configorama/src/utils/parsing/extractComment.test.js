/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../index')
const { extractComment, findCommentStart, getCommentMarkers } = require('./extractComment')

test('extractComment reads trailing inline YAML comments', () => {
  const lines = ['apiKey: ${env:API_KEY} # API key from dashboard']
  assert.equal(extractComment('apiKey', lines, '.yml'), {
    description: 'API key from dashboard',
    descriptionSource: 'comment',
  })
})

test('extractComment reads leading block comments and drops decoration', () => {
  const lines = [
    '# --------',
    '# Database host',
    '# Used by app startup',
    'host: ${env:DB_HOST}',
  ]
  assert.equal(extractComment('host', lines, '.yaml'), {
    description: 'Database host Used by app startup',
    descriptionSource: 'leadingComment',
  })
})

test('extractComment ignores comment markers inside variables and quotes', () => {
  const lines = ['apiKey: ${env:API_KEY, "abc#123"} # Real comment']
  const start = findCommentStart(lines[0], getCommentMarkers('.yml'))
  assert.is(lines[0].slice(start.index), '# Real comment')
})

test('extractComment uses path-aware lookup for nested duplicate YAML keys', () => {
  const lines = [
    'first:',
    '  apiKey: ${env:FIRST_KEY} # First key',
    'second:',
    '  apiKey: ${env:SECOND_KEY} # Second key',
  ]
  assert.equal(extractComment('second.apiKey', lines, '.yml'), {
    description: 'Second key',
    descriptionSource: 'comment',
  })
})

test('extractComment skips JSON comments and handles failures without throwing', () => {
  assert.is(extractComment('apiKey', ['"apiKey": "${env:API_KEY}" // ignored'], '.json'), null)
  assert.is(extractComment(null, null, '.yml'), null)
})

test('extractComment handles JSON5 line comments', () => {
  const lines = [
    '{',
    '  "apiKey": "${env:API_KEY}" // API key',
    '}',
  ]
  assert.equal(extractComment('apiKey', lines, '.json5'), {
    description: 'API key',
    descriptionSource: 'comment',
  })
})

test('extractComment parses leading YAML annotation tags', () => {
  const lines = [
    '# Stripe live secret key',
    '# @from Stripe dashboard > Developers > API keys',
    '# @sensitive true',
    'stripeSecret: ${env:STRIPE_SECRET_KEY}',
  ]
  assert.equal(extractComment('stripeSecret', lines, '.yml'), {
    description: 'Stripe live secret key',
    descriptionSource: 'leadingComment',
    annotations: {
      obtainHint: 'Stripe dashboard > Developers > API keys',
      sensitive: true,
    },
    obtainHint: 'Stripe dashboard > Developers > API keys',
    sensitive: true,
  })
})

test('extractComment lets explicit @description override plain comment text', () => {
  const lines = [
    '# Plain comment loses to explicit description',
    '# @description Stripe live secret key',
    'stripeSecret: ${env:STRIPE_SECRET_KEY}',
  ]
  assert.equal(extractComment('stripeSecret', lines, '.yaml'), {
    description: 'Stripe live secret key',
    descriptionSource: 'commentTag',
    annotations: {
      description: 'Stripe live secret key',
    },
  })
})

test('extractComment parses inline tags without requiring a description', () => {
  const lines = [
    'stripeSecret: ${env:STRIPE_SECRET_KEY} # @from Stripe dashboard > Developers > API keys',
  ]
  assert.equal(extractComment('stripeSecret', lines, '.yaml'), {
    annotations: {
      obtainHint: 'Stripe dashboard > Developers > API keys',
    },
    obtainHint: 'Stripe dashboard > Developers > API keys',
  })
})

test('extractComment parses JSONC and HCL annotation comments', () => {
  const jsoncLines = [
    '{',
    '  // @group Payments',
    '  "stripeSecret": "${env:STRIPE_SECRET_KEY}"',
    '}',
  ]
  assert.equal(extractComment('stripeSecret', jsoncLines, '.jsonc'), {
    annotations: {
      group: 'Payments',
    },
    group: 'Payments',
  })

  const hclLines = [
    '// Stripe live secret key',
    '// @from Stripe dashboard > Developers > API keys',
    'stripe_secret = "${env:STRIPE_SECRET_KEY}"',
  ]
  assert.equal(extractComment('stripe_secret', hclLines, '.hcl'), {
    description: 'Stripe live secret key',
    descriptionSource: 'leadingComment',
    annotations: {
      obtainHint: 'Stripe dashboard > Developers > API keys',
    },
    obtainHint: 'Stripe dashboard > Developers > API keys',
  })
})

test('extractComment keeps unknown tag-shaped comments as plain description', () => {
  const lines = [
    '# @david rotate this key after launch',
    'stripeSecret: ${env:STRIPE_SECRET_KEY}',
  ]
  assert.equal(extractComment('stripeSecret', lines, '.yaml'), {
    description: '@david rotate this key after launch',
    descriptionSource: 'leadingComment',
  })
})

test('requirements model uses comments when help is absent and keeps help precedence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-comments-'))
  const configPath = path.join(dir, 'config.yml')
  fs.writeFileSync(configPath, [
    '# API key from dashboard',
    'apiKey: ${env:CONFIGORAMA_COMMENT_API_KEY}',
    'withHelp: ${env:CONFIGORAMA_COMMENT_HELP | help("Help wins")} # Comment loses',
    'nested:',
    '  apiKey: ${env:CONFIGORAMA_COMMENT_NESTED} # Nested key',
  ].join('\n'))

  try {
    const result = await configorama.analyze(configPath, {
      instructions: true,
      options: {}
    })
    const byVariable = Object.fromEntries(result.requirements.map(req => [req.variable, req]))

    assert.is(byVariable['env:CONFIGORAMA_COMMENT_API_KEY'].description, 'API key from dashboard')
    assert.is(byVariable['env:CONFIGORAMA_COMMENT_API_KEY'].descriptionSource, 'leadingComment')
    assert.is(byVariable['env:CONFIGORAMA_COMMENT_HELP'].description, 'Help wins')
    assert.is(byVariable['env:CONFIGORAMA_COMMENT_HELP'].descriptionSource, 'help')
    assert.is(byVariable['env:CONFIGORAMA_COMMENT_NESTED'].description, 'Nested key')
    assert.is(byVariable['env:CONFIGORAMA_COMMENT_NESTED'].descriptionSource, 'comment')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test.run()
