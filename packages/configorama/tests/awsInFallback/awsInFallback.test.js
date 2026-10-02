/* Variables the default syntax excludes (${aws:...}, ${AWS::...}) are left for Serverless and */
/* CloudFormation. Inside another variable's fallback they pass through instead of blocking    */
/* that variable; outside any variable (IAM policy variables) they stay literal as before.     */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const UNSET = 'CONFIGORAMA_AWS_TEST_UNSET'
const SET = 'CONFIGORAMA_AWS_TEST_SET'
const SERVERLESS = { allowUnknownVariableTypes: true, allowUnresolvedVariables: true, options: { stage: 'qa' } }

test.before.each(() => {
  delete process.env[UNSET]
  process.env[SET] = 'from-env'
})

test.after(() => {
  delete process.env[SET]
})

/**
 * Resolve key `out`
 * @param {string} expr - YAML value text for out
 * @param {object} [settings]
 * @returns {Promise<any>}
 */
async function resolveOut(expr, settings = SERVERLESS) {
  const config = await resolveYamlText(`custom:\n  name: app\nout: ${JSON.stringify(expr)}\n`, settings)
  return config.out
}

test('aws:accountId in a quoted fallback passes through', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, 'app-\${aws:accountId}'}`), 'app-${aws:accountId}')
})

test('aws:region as the whole quoted fallback', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, '\${aws:region}'}`), '${aws:region}')
})

test('aws: ref as an unquoted fallback item', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, \${aws:region}}`), '${aws:region}')
})

test('aws: ref next to a self ref in the fallback', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, '\${self:custom.name}-\${aws:accountId}-\${aws:region}'}`), 'app-${aws:accountId}-${aws:region}')
})

test('env set: the fallback holding aws: is unused', async () => {
  assert.is(await resolveOut(`\${env:${SET}, 'app-\${aws:accountId}'}`), 'from-env')
})

test('AWS:: pseudo parameter in a fallback passes through', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, 'arn:aws:s3:::b-\${AWS::AccountId}'}`), 'arn:aws:s3:::b-${AWS::AccountId}')
})

test('IAM policy variables outside any variable stay literal', async () => {
  assert.is(await resolveOut('arn:aws:s3:::bucket/${aws:username}/*'), 'arn:aws:s3:::bucket/${aws:username}/*')
  assert.is(await resolveOut('arn:aws:s3:::bucket/${aws:PrincipalTag/team}/*'), 'arn:aws:s3:::bucket/${aws:PrincipalTag/team}/*')
  assert.is(await resolveOut('${aws:accountId}', {}), '${aws:accountId}', 'without unknown-type settings too')
})

test('IAM policy variable in Fn::Sub next to a self ref', async () => {
  const yml = 'custom:\n  name: app\nR:\n  Fn::Sub: "arn:aws:s3:::${self:custom.name}/${aws:username}/${AWS::Region}"\n'
  const config = await resolveYamlText(yml, SERVERLESS)
  assert.is(config.R['Fn::Sub'], 'arn:aws:s3:::app/${aws:username}/${AWS::Region}')
})

test('a filter over a fallback holding aws:accountId is an error', async () => {
  let error
  try {
    await resolveOut(`\${env:${UNSET}, 'app-\${aws:accountId}' | toUpperCase}`)
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error')
  assert.match(error.message, '${aws:accountId}')
})

test.run()
