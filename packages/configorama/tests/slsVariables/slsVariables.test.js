/* ${sls:stage} resolves the way Serverless (osls) does: --stage, else provider.stage, else */
/* 'dev'. Other sls: addresses (instanceId) stay passthrough for Serverless to fill in.     */
/* A filter can't run on a value that still holds a passthrough: that is an error.          */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const UNSET = 'CONFIGORAMA_SLS_TEST_UNSET'
const SERVERLESS = { allowUnknownVariableTypes: true, allowUnresolvedVariables: true }

test.before.each(() => {
  delete process.env[UNSET]
})

test('--stage option wins', async () => {
  const config = await resolveYamlText("provider:\n  stage: prod\nname: app-${sls:stage}\n", { options: { stage: 'qa' } })
  assert.is(config.name, 'app-qa')
})

test('falls back to a literal provider.stage', async () => {
  const config = await resolveYamlText('provider:\n  stage: prod\nname: app-${sls:stage}\n')
  assert.is(config.name, 'app-prod')
})

test('falls back to provider.stage that is itself a variable', async () => {
  const config = await resolveYamlText("provider:\n  stage: ${opt:stage, 'staging'}\nname: app-${sls:stage}\n")
  assert.is(config.name, 'app-staging')
})

test("defaults to 'dev' with no stage anywhere", async () => {
  const config = await resolveYamlText('name: app-${sls:stage}\n')
  assert.is(config.name, 'app-dev')
})

test('resolves without allowUnknownVariableTypes', async () => {
  const config = await resolveYamlText('name: ${sls:stage}\n', { options: { stage: 'qa' } })
  assert.is(config.name, 'qa')
})

test('inside a quoted fallback, with a filter applied', async () => {
  const config = await resolveYamlText(`name: \${env:${UNSET}, 'sl-\${sls:stage}' | toUpperCase}\n`, { ...SERVERLESS, options: { stage: 'qa' } })
  assert.is(config.name, 'SL-QA')
})

test('inside Fn::Sub next to CloudFormation refs', async () => {
  const yml = 'Resources:\n  R:\n    Properties:\n      Arn:\n        Fn::Sub: "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:app-${sls:stage}-fn"\n'
  const config = await resolveYamlText(yml, { ...SERVERLESS, options: { stage: 'qa' } })
  assert.is(config.Resources.R.Properties.Arn['Fn::Sub'], 'arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:app-qa-fn')
})

test('${sls:instanceId} stays passthrough', async () => {
  const config = await resolveYamlText('id: run-${sls:instanceId}\n', { ...SERVERLESS, options: { stage: 'qa' } })
  assert.is(config.id, 'run-${sls:instanceId}')
})

test('a filter on a value still holding a passthrough is an error, not a silent no-op', async () => {
  let error
  try {
    await resolveYamlText(`name: \${env:${UNSET}, 'sl-\${ssm:/app/prefix}' | toUpperCase}\n`, SERVERLESS)
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error')
  assert.match(error.message, 'toUpperCase')
  assert.match(error.message, '${ssm:/app/prefix}')
})

test.run()
