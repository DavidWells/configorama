/* A variable that starts a fallback item but is not the whole item (${env:X, ${self:a}-${self:b}}) */
/* resolves into the item's text. Regression (1.4.4-1.4.7): it was encoded as a whole-value token */
/* that never decoded, giving '__JSON_B64__...__-dev' for a Serverless stack name.                */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const UNSET = 'CONFIGORAMA_PARTIAL_ITEM_UNSET'

test.before.each(() => {
  delete process.env[UNSET]
})

test('serverless stack-name pattern: env fallback to a self value composed of self refs', async () => {
  const yml = [
    'service: rbac-admin-ui',
    'provider:',
    "  stage: ${opt:stage, 'dev'}",
    `  stackName: \${env:${UNSET}, self:custom.defaultStackName}`,
    'custom:',
    '  defaultStackName: ${self:service}-${self:provider.stage}',
    ''
  ].join('\n')
  const config = await resolveYamlText(yml, { options: { stage: 'qa' } })
  assert.is(config.provider.stackName, 'rbac-admin-ui-qa')
  assert.is(config.custom.defaultStackName, 'rbac-admin-ui-qa')
})

/**
 * Resolve key `out` with custom.a = 'x' and custom.b = 'y'
 * @param {string} expr - YAML value text for out
 * @returns {Promise<any>}
 */
async function resolveOut(expr) {
  const yml = `custom:\n  a: x\n  b: y\n  v: "p@ss|w0rd"\nout: ${JSON.stringify(expr)}\n`
  const config = await resolveYamlText(yml)
  return config.out
}

test('inline fallback item made of two variables', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, \${self:custom.a}-\${self:custom.b}}`), 'x-y')
})

test('fallback item: variable followed by text', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, \${self:custom.a}-suffix}`), 'x-suffix')
})

test('fallback item: text before the variable', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, prefix-\${self:custom.a}}`), 'prefix-x')
})

test('partial item in a later fallback slot', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, env:${UNSET}_2, \${self:custom.a}-\${self:custom.b}}`), 'x-y')
})

test('control: whole-item fallback still keeps its value exactly', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, self:custom.v}`), 'p@ss|w0rd')
  assert.is(await resolveOut(`\${env:${UNSET}, \${self:custom.a}}`), 'x')
})

test('boolean value starting a longer fallback item', async () => {
  const config = await resolveYamlText(`custom:\n  flag: true\nout: "\${env:${UNSET}, \${self:custom.flag}-x}"\n`)
  assert.is(config.out, 'true-x')
})

test('control: boolean as the whole fallback item keeps its type', async () => {
  const config = await resolveYamlText(`custom:\n  flag: true\nout: "\${env:${UNSET}, \${self:custom.flag}}"\n`)
  assert.is(config.out, true)
})

test('composed item inside surrounding text', async () => {
  assert.is(await resolveOut(`pre/\${env:${UNSET}, \${self:custom.a}-\${self:custom.b}}/post`), 'pre/x-y/post')
})

test.run()
