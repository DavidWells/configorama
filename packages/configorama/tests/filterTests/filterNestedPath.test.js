/* eslint-disable no-template-curly-in-string */
// Regression: a filter on a dynamic-key lookup — ${map.${selector} | filter} — must apply to the
// LOOKUP RESULT, not to the inner selector. getValueFromDeep resolved the selector while inheriting the
// outer expression's originalSource, so the outer trailing filter folded onto the selector (dev -> DEV,
// giving an unresolvable ${map.DEV | filter}). Filters here are non-idempotent where it matters.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const filters = {
  append: (value, s) => String(value) + String(s),
}

test('filter applies to the lookup result, not the nested selector', async () => {
  const out = await configorama(
    { originalStage: '${opt:stage}', domains: { dev: 'api-dev.com' }, v: '${domains.${originalStage} | toUpperCase}' },
    { options: { stage: 'dev' } },
  )
  assert.is(out.v, 'API-DEV.COM')
})

test('a nested-path lookup without a filter is unaffected', async () => {
  const out = await configorama(
    { originalStage: '${opt:stage}', domains: { dev: 'api-dev.com' }, v: '${domains.${originalStage}}' },
    { options: { stage: 'dev' } },
  )
  assert.is(out.v, 'api-dev.com')
})

test('chained filters apply to the lookup result', async () => {
  const out = await configorama(
    { originalStage: '${opt:stage}', domains: { dev: 'api-Dev.Com' }, v: '${domains.${originalStage} | toLowerCase | toUpperCase}' },
    { options: { stage: 'dev' } },
  )
  assert.is(out.v, 'API-DEV.COM')
})

test('an arg-bearing filter applies to the lookup result', async () => {
  const out = await configorama(
    { originalStage: '${opt:stage}', domains: { dev: 'api-dev.com' }, v: "${domains.${originalStage} | append('!')}" },
    { options: { stage: 'dev' }, filters },
  )
  assert.is(out.v, 'api-dev.com!')
})

test('a filter on the inner selector still applies to the selector', async () => {
  const out = await configorama(
    { stage: 'Dev', map: { DEV: 'x' }, v: '${map.${self:stage | toUpperCase}}' },
    { options: {} },
  )
  assert.is(out.v, 'x')
})

test('inner-selector filter and outer-result filter both apply to the right targets', async () => {
  const out = await configorama(
    { stage: 'Dev', map: { DEV: 'result-val' }, v: '${map.${self:stage | toUpperCase} | toUpperCase}' },
    { options: {} },
  )
  assert.is(out.v, 'RESULT-VAL')
})

test('a two-level dynamic path with a filter on the result', async () => {
  const out = await configorama(
    { region: 'us', envs: { us: { name: 'prod-us' } }, v: '${envs.${self:region}.name | toUpperCase}' },
    { options: {} },
  )
  assert.is(out.v, 'PROD-US')
})

test('a filtered lookup whose selector is a fallback', async () => {
  const out = await configorama(
    { domains: { dev: 'api-dev.com' }, sel: '${env:MISSING, "dev"}', v: '${domains.${self:sel} | toUpperCase}' },
    { options: {} },
  )
  assert.is(out.v, 'API-DEV.COM')
})

test.run()
