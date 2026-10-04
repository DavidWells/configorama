/* eslint-disable no-template-curly-in-string */
// Tests for the generic `overrides` setting / CONFIGORAMA_OVERRIDES env: exact-ref values for any
// resolver type, precedence over the env, fallbacks, filters, custom-resolver hooks and error messages.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-overrides-'))

/**
 * @param {string} name
 * @param {string[]} lines
 * @returns {string}
 */
function writeConfig(name, lines) {
  const file = path.join(root, name)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

function clearEnv() {
  delete process.env.CONFIGORAMA_OVERRIDES
  delete process.env.OVERRIDES_TEST_VAR
}

test.before.each(clearEnv)
test.after.each(clearEnv)
test.after(() => {
  try { fs.rmSync(root, { recursive: true, force: true }) } catch (e) { /* ignore */ }
})

test('exact-ref override replaces env: and opt: values', async () => {
  const file = writeConfig('basic.yml', [
    'fromEnv: ${env:OVERRIDES_TEST_VAR}',
    'fromOpt: ${opt:stage}',
    'untouched: ${opt:region}',
  ])
  process.env.OVERRIDES_TEST_VAR = 'real-env'
  const config = await configorama(file, {
    options: { stage: 'dev', region: 'us-west-1' },
    overrides: { 'env:OVERRIDES_TEST_VAR': 'overridden-env', 'opt:stage': 'prod' },
  })
  assert.is(config.fromEnv, 'overridden-env')
  assert.is(config.fromOpt, 'prod')
  assert.is(config.untouched, 'us-west-1')
})

test('an override satisfies a ref that would otherwise be unresolvable', async () => {
  const file = writeConfig('missing.yml', ['value: ${env:OVERRIDES_TEST_VAR}'])
  const config = await configorama(file, { overrides: { 'env:OVERRIDES_TEST_VAR': 'supplied' } })
  assert.is(config.value, 'supplied')
})

test('override values keep their type (number, boolean, object)', async () => {
  const file = writeConfig('types.yml', [
    'num: ${opt:count}',
    'flag: ${opt:enabled}',
    'obj: ${opt:settings}',
  ])
  const config = await configorama(file, {
    overrides: { 'opt:count': 3, 'opt:enabled': false, 'opt:settings': { a: 1 } },
  })
  assert.is(config.num, 3)
  assert.is(config.flag, false)
  assert.equal(config.obj, { a: 1 })
})

test('an empty-string override is a real value', async () => {
  const file = writeConfig('empty.yml', ["value: ${opt:thing, 'fallback'}"])
  const config = await configorama(file, { overrides: { 'opt:thing': '' } })
  assert.is(config.value, '')
})

test('a fallback still applies when the first ref has no override', async () => {
  const file = writeConfig('fallback.yml', ['value: ${opt:missing, opt:present}'])
  const config = await configorama(file, { overrides: { 'opt:present': 'from-override' } })
  assert.is(config.value, 'from-override')
})

test('filters run on overridden values', async () => {
  const file = writeConfig('filters.yml', ['value: ${opt:name | toUpperCase}'])
  const config = await configorama(file, { overrides: { 'opt:name': 'widget' } })
  assert.is(config.value, 'WIDGET')
})

test('CONFIGORAMA_OVERRIDES env supplies values; the setting beats it per ref', async () => {
  const file = writeConfig('precedence.yml', [
    'a: ${opt:a}',
    'b: ${opt:b}',
  ])
  process.env.CONFIGORAMA_OVERRIDES = JSON.stringify({ 'opt:a': 'env-a', 'opt:b': 'env-b' })
  const config = await configorama(file, { overrides: { 'opt:b': 'setting-b' } })
  assert.is(config.a, 'env-a')
  assert.is(config.b, 'setting-b')
})

test('null/undefined override values are ignored', async () => {
  const file = writeConfig('nulls.yml', ['value: ${opt:stage}'])
  const config = await configorama(file, {
    options: { stage: 'dev' },
    overrides: { 'opt:stage': null },
  })
  assert.is(config.value, 'dev')
})

test('a custom resolver override hook answers aliases; exact match is the fallback', async () => {
  const file = writeConfig('custom.yml', [
    'viaHook: ${thing:alias}',
    'viaExact: ${thing:exact}',
    'live: ${thing:other}',
  ])
  const thingSource = {
    type: 'thing',
    prefix: 'thing',
    match: /^thing:/,
    resolver: (/** @type {string} */ v) => `live-${v.split(':')[1]}`,
    override: (/** @type {string} */ v, /** @type {Record<string, any>} */ overrides) => {
      return v === 'thing:alias' ? overrides['thing:canonical'] : undefined
    },
  }
  const config = await configorama(file, {
    variableSources: [thingSource],
    overrides: { 'thing:canonical': 'from-hook', 'thing:exact': 'from-exact' },
  })
  assert.is(config.viaHook, 'from-hook')
  assert.is(config.viaExact, 'from-exact')
  assert.is(config.live, 'live-other')
})

test('invalid CONFIGORAMA_OVERRIDES JSON throws without echoing the value', async () => {
  const file = writeConfig('bad-env.yml', ['value: ${opt:stage, "x"}'])
  process.env.CONFIGORAMA_OVERRIDES = '{not json secret123'
  let error
  try {
    await configorama(file)
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error for invalid JSON')
  assert.match(String(error.message), /CONFIGORAMA_OVERRIDES must be a JSON object/)
  assert.not.match(String(error.message), /secret123/)
})

test('a non-object overrides setting throws a clear error', async () => {
  const file = writeConfig('bad-setting.yml', ['value: ${opt:stage, "x"}'])
  let error
  try {
    // @ts-ignore deliberately wrong type
    await configorama(file, { overrides: ['opt:stage'] })
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error for a non-object overrides setting')
  assert.match(String(error.message), /"overrides" setting must be an object/)
})

test.run()
