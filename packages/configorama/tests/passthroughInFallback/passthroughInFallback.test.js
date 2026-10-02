/* Unknown variable types (${sls:stage}, ${ssm:/path}) inside a quoted fallback string pass */
/* through verbatim when allowUnknownVariableTypes is on, with the text around them kept. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'passthroughInFallback.yml')
// Settings Serverless wrappers use: osls resolves ${sls:...}/${aws:...} after configorama
const settings = { options: { stage: 'qa' }, allowUnknownVariableTypes: true, allowUnresolvedVariables: true }

/** @type {Record<string, any>} */
let config

test.before(() => {
  delete process.env.CONFIGORAMA_TEST_UNSET
  delete process.env.CONFIGORAMA_TEST_UNSET2
  process.env.CONFIGORAMA_TEST_SET = 'from-env'
})

test.after(() => {
  delete process.env.CONFIGORAMA_TEST_SET
})

test('resolves fixture', async () => {
  config = await configorama(fixture, { configDir: __dirname, ...settings })
  assert.type(config, 'object')
})

test('passthrough with text around it in a quoted fallback', () => {
  assert.is(config.textAround, 'sl-${sls:stage}-manifest')
})

test('passthrough as the whole quoted fallback', () => {
  assert.is(config.onlyPassthrough, '${sls:stage}')
})

test('double-quoted fallback', () => {
  assert.is(config.doubleQuoted, 'sl-${sls:stage}-manifest')
})

test('two passthroughs in one quoted fallback', () => {
  assert.is(config.twoPassthroughs, '${ssm:/app/prefix}-${sls:stage}')
})

test('self ref resolves next to a passthrough in a quoted fallback', () => {
  assert.is(config.mixedWithSelf, 'dev-${sls:stage}')
})

test('self ref to a passthrough fallback value keeps it', () => {
  assert.is(config.derived, 'sl-${sls:stage}-manifest-tables')
})

test('fallback variable with text on both sides', () => {
  assert.is(config.inText, 'prefix-sl-${sls:stage}-suffix')
})

test('outer opt: variable missing uses the passthrough fallback', () => {
  assert.is(config.optMissing, 'sl-${sls:stage}-manifest')
})

test('outer opt: variable set ignores the passthrough fallback', () => {
  assert.is(config.optSet, 'qa')
})

test('inside arrays and nested objects', () => {
  assert.equal(config.nested.list, ['a-${sls:stage}'])
  assert.is(config.nested.obj.key, 'b-${ssm:/x/y}')
})

test('passthrough as an unquoted fallback variable', () => {
  assert.is(config.bareFallback, '${sls:stage}')
})

test('env set: fallback unused', () => {
  assert.is(config.envSet, 'from-env')
})

test('control: passthrough outside a fallback', () => {
  assert.is(config.bare, 'sl-${sls:stage}-manifest')
})

test('allowUnknownVariableTypes as a type list', async () => {
  const listed = await configorama(fixture, { configDir: __dirname, ...settings, allowUnknownVariableTypes: ['sls', 'ssm'] })
  assert.is(listed.textAround, 'sl-${sls:stage}-manifest')
  assert.is(listed.twoPassthroughs, '${ssm:/app/prefix}-${sls:stage}')
  assert.is(listed.bare, 'sl-${sls:stage}-manifest')
})

test('quoted passthrough fallback after other unresolvable list items', async () => {
  const later = await configorama(path.join(__dirname, 'laterSlot.yml'), { configDir: __dirname, options: {}, allowUnknownVariableTypes: true })
  assert.is(later.afterMissingEnv, 'sl-${sls:stage}')
  assert.is(later.afterMissingSelf, 'c-${sls:stage}')
})

/**
 * Resolve a fixture expecting it to throw
 * @param {string} file
 * @param {object} opts
 * @returns {Promise<Error>}
 */
async function resolveError(file, opts) {
  try {
    await configorama(path.join(__dirname, file), { configDir: __dirname, options: {}, ...opts })
  } catch (err) {
    return /** @type {Error} */ (err)
  }
  throw new Error(`expected ${file} to fail`)
}

test('unknown types not allowed: passthrough in a quoted fallback is an error, not mangled text', async () => {
  const err = await resolveError('strict.yml', {})
  assert.match(err.message, 'Variable: "sls:stage"')
  assert.match(err.message, 'not found')
})

test('type list without the type: passthrough in a quoted fallback is an error', async () => {
  const err = await resolveError('strict.yml', { allowUnknownVariableTypes: ['ssm'] })
  assert.match(err.message, 'Variable: "sls:stage"')
})

test('missing self ref in a quoted fallback is an error', async () => {
  const err = await resolveError('missingSelf.yml', { allowUnknownVariableTypes: true })
  assert.match(err.message, '${self:nope}')
})

test('sync API', () => {
  const syncConfig = configorama.sync(fixture, settings)
  assert.is(syncConfig.textAround, 'sl-${sls:stage}-manifest')
  assert.is(syncConfig.onlyPassthrough, '${sls:stage}')
  assert.is(syncConfig.derived, 'sl-${sls:stage}-manifest-tables')
  assert.is(syncConfig.inText, 'prefix-sl-${sls:stage}-suffix')
  assert.is(syncConfig.optSet, 'qa')
})

test.run()
