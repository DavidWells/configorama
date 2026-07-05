/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('opt syntax continues to resolve from CLI options', async () => {
  const config = await configorama({
    stage: '${opt:stage}',
  }, {
    options: { stage: 'prod' }
  })

  assert.is(config.stage, 'prod')
})

test('option syntax resolves from the same CLI options object', async () => {
  const config = await configorama({
    stage: '${option:stage}',
  }, {
    options: { stage: 'prod' }
  })

  assert.is(config.stage, 'prod')
})

test('option syntax supports fallbacks', async () => {
  const config = await configorama({
    stage: '${option:stage, "dev"}',
  }, {
    options: {}
  })

  assert.is(config.stage, 'dev')
})

test('analyze and requirements normalize option syntax to option variableType', async () => {
  const analysis = await configorama.analyze({
    stage: '${option:stage}',
    legacyStage: '${opt:legacyStage}',
  }, {
    options: {}
  })

  assert.is(analysis.uniqueVariables['option:stage'].variableType, 'options')
  assert.is(analysis.uniqueVariables['opt:legacyStage'].variableType, 'options')

  const requirements = await configorama.analyze({
    stage: '${option:stage}',
    legacyStage: '${opt:legacyStage}',
  }, {
    instructions: true,
    options: {}
  })

  const byVariable = Object.fromEntries(requirements.requirements.map(req => [req.variable, req]))
  assert.is(byVariable['option:stage'].variableType, 'option')
  assert.is(byVariable['option:stage'].name, 'stage')
  assert.is(byVariable['opt:legacyStage'].variableType, 'option')
  assert.is(byVariable['opt:legacyStage'].name, 'legacyStage')
})

test.run()
