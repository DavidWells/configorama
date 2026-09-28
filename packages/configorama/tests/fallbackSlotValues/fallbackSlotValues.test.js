/* A value that lands in a fallback slot is one finished value: whatever it contains, it   */
/* resolves the same as referencing it directly. Regressions: ${env:X, self:v} with v = */
/* 'p@ss|w0rd' threw (the | read as a filter), with two fallbacks 'a|b' silently became */
/* 'a', 'say "hi"' gained a quote, ' pad ' was trimmed and '123' turned into a number.   */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const UNSET = 'CONFIGORAMA_FALLBACK_SLOT_UNSET'
const VAL = 'CONFIGORAMA_FALLBACK_SLOT_VAL'

/**
 * Resolve key `out` with custom.v set to the given string
 * @param {string} v - Value of custom.v (also set as the VAL env var)
 * @param {string} expr - YAML value text for out
 * @returns {Promise<any>} The resolved out
 */
async function resolveWith(v, expr) {
  process.env[VAL] = v
  const yml = `custom:\n  v: ${JSON.stringify(v)}\n  alias: \${self:custom.v}\nout: ${JSON.stringify(expr)}\n`
  const config = await resolveYamlText(yml)
  return config.out
}

test.before.each(() => {
  delete process.env[UNSET]
  delete process.env[VAL]
})

test('a | in a fallback value is text, not a filter', async () => {
  assert.is(await resolveWith('p@ss|w0rd', `\${env:${UNSET}, self:custom.v}`), 'p@ss|w0rd')
  assert.is(await resolveWith('a|b', `\${env:${UNSET}, env:${UNSET}_2, self:custom.v}`), 'a|b', 'not truncated to "a"')
  assert.is(await resolveWith('{"a":1,"b":"x|y"}', `\${opt:nope, self:custom.v}`), '{"a":1,"b":"x|y"}')
})

test('quotes and edge whitespace in a fallback value are kept', async () => {
  assert.is(await resolveWith('say "hi"', `\${env:${UNSET}, self:custom.v}`), 'say "hi"')
  assert.is(await resolveWith(' pad ', `\${env:${UNSET}, self:custom.v}`), ' pad ')
})

test('a numeric-looking string fallback stays a string', async () => {
  assert.is(await resolveWith('123', `\${env:${UNSET}, self:custom.v}`), '123')
})

test('an env value with a | used as a fallback', async () => {
  assert.is(await resolveWith('p@ss|w0rd', `\${opt:nope, env:${VAL}}`), 'p@ss|w0rd')
})

test('filters after the last fallback still apply to the winner', async () => {
  assert.is(await resolveWith('a|b', `\${env:${UNSET}, self:custom.v | toUpperCase}`), 'A|B')
})

test('the same variable twice, once as a fallback, resolves both copies', async () => {
  assert.is(await resolveWith('a|b', '${self:custom.v}-${opt:nope, ${self:custom.v}}'), 'a|b-a|b')
})

/* Every slot must give what direct ${self:custom.v} gives, value and type */
const VALUES = ['a,b,c', 'a|b', "it's", 'say "hi"', 'x}y', 'x{y}', '$HOME', 'a:b', 'f(x)', 'a, b',
  ' pad ', 'a.b', '[1,2]', '__CFG_C44__', 'a\\,b', '#hash', 'k: v', '', 'true', '123', '%s', '&&',
  "'q', 'r'", 'a b c', '__JSON_B64__eA==__']
const SLOTS = {
  envFallback: `\${env:${UNSET}, self:custom.v}`,
  envFallbackNested: `\${env:${UNSET}, \${self:custom.v}}`,
  optFallback: '${opt:nope, self:custom.v}',
  twoFallbacks: `\${env:${UNSET}, env:${UNSET}_2, self:custom.v}`,
  deepNest: `\${env:${UNSET}, \${opt:nope, \${self:custom.v}}}`,
  aliasFallback: `\${env:${UNSET}, self:custom.alias}`,
  envValueFallback: `\${opt:nope, env:${VAL}}`,
  filterIdentity: `\${env:${UNSET}, self:custom.v | String}`,
}

test('value x slot matrix matches direct resolution', async () => {
  const failures = []
  for (const v of VALUES) {
    const direct = await resolveWith(v, '${self:custom.v}')
    for (const [slot, expr] of Object.entries(SLOTS)) {
      let got
      try {
        got = await resolveWith(v, expr)
      } catch (e) {
        got = `THROW ${e.message.split('\n')[0]}`
      }
      if (got !== direct) failures.push(`${slot} ${JSON.stringify(v)}: got ${JSON.stringify(got)}, direct ${JSON.stringify(direct)}`)
    }
  }
  assert.equal(failures, [])
})

test.run()
