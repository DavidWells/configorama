/* Tests for nested variable resolution in overwrite/fallback scenarios */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

/**
 * Bug scenario (fixed):
 * - FOO: ${file(./env.${self:provider.stage, 'dev'}.yml):FOO}
 * - provider.stage is itself a variable: ${opt:stage, 'dev'}
 * - When stage='prod', should resolve to env.prod.yml:FOO
 * - Bug: it was resolving to env.prodX.yml (using VALUE from file instead of stage)
 *
 * Root cause: overwrite() was returning the full outer string with deep refs
 * instead of a minimal reconstructed variable string.
 */

test('nested variable in file path where inner var resolves to another variable', async () => {
  const configFile = path.join(__dirname, '_nested-var-filepath-bug.yml')

  const config = await configorama(configFile, {
    options: { stage: 'prod' }
  })

  // Should resolve to the value from env.prod.yml
  assert.equal(config.provider.stage, 'prod')
  assert.equal(config.testValue, 'prodX')
})

test('nested variable in file path with fallback - inner var resolves to variable', async () => {
  const configFile = path.join(__dirname, '_nested-var-filepath-bug.yml')

  const config = await configorama(configFile, {
    options: { stage: 'dev' }
  })

  // Should resolve to the value from env.dev.yml
  assert.equal(config.provider.stage, 'dev')
  assert.equal(config.testValue, 'devValue')
})

// Edge case: chained fallbacks where first resolves to a variable
test('chained fallbacks - first fallback resolves to variable', async () => {
  const config = await configorama({
    a: '${opt:a, "defaultA"}',
    b: '${opt:b, "defaultB"}',
    // self:a resolves to ${opt:a, "defaultA"}, self:b resolves to ${opt:b, "defaultB"}
    value: '${self:a, self:b, "fallback"}'
  }, { options: { a: 'valueA' } }) // only provide 'a', not 'b'

  assert.equal(config.value, 'valueA')
})

// Edge case: nested resolution to static fallback
test('nested resolution falls through to static default', async () => {
  const config = await configorama({
    a: '${opt:a, "defaultA"}',
    value: '${self:a, "fallback"}'
  }, { options: {} }) // no options provided

  assert.equal(config.value, 'defaultA')
})

// Edge case: no-space syntax in fallbacks
test('no-space syntax in fallbacks', async () => {
  const config = await configorama({
    stage: '${opt:stage,"dev"}', // no space after comma
    value: '${self:stage,"fallback"}'
  }, { options: { stage: 'prod' } })

  assert.equal(config.value, 'prod')
})

// Edge case: missing opt with static fallback
test('missing opt uses static fallback', async () => {
  const config = await configorama({
    stage: '${opt:stage, "dev"}',
    env: '${opt:env, "local"}'
  }, { options: { stage: 'prod' } }) // opt:env not provided

  assert.equal(config.stage, 'prod')
  assert.equal(config.env, 'local')
})

test.run()
