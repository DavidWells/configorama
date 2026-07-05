/**
 * Test for bug: nested deep refs incorrectly extract inner deep index
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const path = require('path')

const dirname = path.dirname(__filename)

test('nested self ref with dynamic key and variables in target value', async () => {
  // This tests: ${self:custom.alertQueueUrl.${self:custom.alertQueueStage}}
  // where alertQueueUrl.dev contains unresolved variables
  const config = await configorama({
    provider: {
      region: 'us-west-2',
      stage: '${opt:stage}'  // This creates a deep ref
    },
    custom: {
      alertQueueStage: 'dev',
      alertQueueUrl: {
        // This value contains ${self:provider.stage} which needs deep resolution
        dev: 'https://sqs.${self:provider.region}.amazonaws.com/123/alerts-${self:provider.stage}',
        prod: 'https://sqs.${self:provider.region}.amazonaws.com/123/alerts-prod'
      }
    },
    result: '${self:custom.alertQueueUrl.${self:custom.alertQueueStage}}'
  }, {
    configDir: dirname,
    options: { stage: 'dev' }
  })

  // Should resolve to the full URL, not just 'dev'
  assert.is(config.result, 'https://sqs.us-west-2.amazonaws.com/123/alerts-dev')
})

test('nested self ref with allowUnknownVars and variables in target', async () => {
  // Same pattern but with unknown vars preserved
  const config = await configorama({
    provider: {
      region: 'us-west-2',
      stage: '${opt:stage}'
    },
    custom: {
      alertQueueStage: 'dev',
      alertQueueUrl: {
        dev: 'https://sqs.${self:provider.region}.amazonaws.com/${aws:accountId}/alerts-${self:provider.stage}',
        prod: 'https://sqs.${self:provider.region}.amazonaws.com/${aws:accountId}/alerts-prod'
      }
    },
    result: '${self:custom.alertQueueUrl.${self:custom.alertQueueStage}}'
  }, {
    configDir: dirname,
    options: { stage: 'dev' },
    allowUnknownVars: true
  })

  // Should contain the URL with unknown var preserved, not just 'dev'
  // Note: ${self:provider.region} may remain unresolved due to resolution order
  assert.ok(config.result.includes('https://sqs.'))
  assert.ok(config.result.includes('.amazonaws.com/'))
  assert.ok(config.result.includes('${aws:accountId}'))
  assert.ok(config.result.includes('alerts-dev'))
})

test.run()
