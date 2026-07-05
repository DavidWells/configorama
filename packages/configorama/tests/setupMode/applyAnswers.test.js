// applyAnswers applies wizard answer groups onto a resolution context in memory
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { applyAnswers } = require('../../src/utils/setup/applyAnswers')

test('applies all four answer groups to the context', () => {
  const context = {
    options: { region: 'us-east-1' },
    env: {},
    config: { service: 'my-app', nested: { keep: true } },
  }
  applyAnswers(context, {
    options: { stage: 'dev' },
    env: { API_KEY: 'abc123' },
    self: { topLevel: 'value' },
    dotProp: { 'nested.added': 'deep-value' },
  })

  assert.equal(context.options, { region: 'us-east-1', stage: 'dev' })
  assert.equal(context.env, { API_KEY: 'abc123' })
  assert.is(context.config.topLevel, 'value')
  assert.is(context.config.nested.added, 'deep-value')
  assert.is(context.config.nested.keep, true, 'existing nested keys preserved')
})

test('missing answer groups are a no-op', () => {
  const context = { options: { a: 1 }, env: { B: '2' }, config: { c: 3 } }
  applyAnswers(context, {})
  applyAnswers(context, undefined)

  assert.equal(context.options, { a: 1 })
  assert.equal(context.env, { B: '2' })
  assert.equal(context.config, { c: 3 })
})

test('plain-object env target leaves process.env untouched', () => {
  const sentinelKey = 'CONFIGORAMA_APPLY_ANSWERS_TEST_KEY'
  delete process.env[sentinelKey]

  const context = { options: {}, env: {}, config: {} }
  applyAnswers(context, { env: { [sentinelKey]: 'should-not-escape' } })

  assert.is(context.env[sentinelKey], 'should-not-escape')
  assert.is(process.env[sentinelKey], undefined, 'process.env not mutated')
})

test('process.env can be passed as the env target explicitly', () => {
  const sentinelKey = 'CONFIGORAMA_APPLY_ANSWERS_PROC_KEY'
  delete process.env[sentinelKey]

  const context = { options: {}, env: process.env, config: {} }
  applyAnswers(context, { env: { [sentinelKey]: 'escapes-on-purpose' } })

  assert.is(process.env[sentinelKey], 'escapes-on-purpose')
  delete process.env[sentinelKey]
})

test.run()
