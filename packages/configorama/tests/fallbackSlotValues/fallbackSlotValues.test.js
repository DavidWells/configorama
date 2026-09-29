/* A value that lands in a fallback slot is one finished value: whatever it contains, it   */
/* resolves the same as referencing it directly. Regressions: ${env:X, self:v} with v = */
/* 'p@ss|w0rd' threw (the | read as a filter), with two fallbacks 'a|b' silently became */
/* 'a', 'say "hi"' gained a quote, ' pad ' was trimmed and '123' turned into a number.   */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')
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

/* Found by the fuzz properties in tests/fuzz */
test('a missing item three levels deep takes its fallbacks from its own list', async () => {
  const expr = `\${env:${UNSET}, \${self:custom.missing, \${env:${UNSET}_2, env:${UNSET}_3, \${self:custom.v}}}}`
  assert.is(await resolveWith('abc', expr), 'abc', 'was "abc}}"')
  assert.is(await resolveWith('abc', `\${env:${UNSET}, env:${UNSET}_2, \${opt:nope, \${env:${UNSET}_3, env:${UNSET}_4, \${self:custom.v}}}}`), 'abc')
})

test('a boolean through an alias stays a boolean as a fallback', async () => {
  const yml = (v) => `custom:\n  v: ${v}\n  alias: \${self:custom.v}\nout: \${env:${UNSET}, self:custom.alias}\nnested: \${self:custom.missing, \${opt:nope, \${self:custom.alias, 'not-this'}}}\n`
  const off = await resolveYamlText(yml('false'))
  assert.is(off.out, false)
  assert.is(off.nested, false)
  assert.is((await resolveYamlText(yml('true'))).out, true)
})

test('three or more items, the resolved one in the middle', async () => {
  assert.is(await resolveWith('a|b', `\${opt:nope, self:custom.v, env:${UNSET}, env:${UNSET}_2}`), 'a|b')
})

test('an empty object or array as the last fallback is still returned', async () => {
  const config = await resolveYamlText(`custom:\n  o: {}\n  a: []\no: \${env:${UNSET}, \${self:custom.o}}\na: \${env:${UNSET}, self:custom.a}\n`)
  assert.equal(config.o, {})
  assert.equal(config.a, [])
})

/**
 * Resolve an expression with a spy source that records its calls
 * @param {string} expr
 * @returns {Promise<{ out: any, calls: string[] }>}
 */
async function withSpy(expr) {
  /** @type {string[]} */
  const calls = []
  const spy = {
    type: 'spy', source: 'remote', prefix: 'spy', syntax: '${spy:key}', description: 'records calls',
    match: RegExp(/^spy:/g),
    resolver: async (/** @type {string} */ v) => { calls.push(v); return 'from-spy' },
  }
  process.env[VAL] = 'present'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-lazy-'))
  const file = path.join(dir, 'lazy.yml')
  fs.writeFileSync(file, `out: ${JSON.stringify(expr)}\n`)
  const config = await configorama(file, { configDir: dir, variableSources: [spy], options: { present: 'present' } })
  fs.rmSync(dir, { recursive: true, force: true })
  return { out: config.out, calls }
}

test('a fallback is not evaluated when an earlier item resolves', async () => {
  for (const expr of [
    `\${env:${VAL}, spy:a}`,
    `\${env:${VAL}, \${spy:a}}`,
    '${opt:nope, opt:present, spy:a, spy:b}',
    `\${env:${UNSET}, env:${UNSET}_2, self:custom.nope, opt:present, spy:a}`,
    `\${env:${UNSET}, \${opt:nope, opt:present, spy:a}}`,
  ]) {
    const { out, calls } = await withSpy(expr)
    assert.is(out, 'present', expr)
    assert.equal(calls, [], `${expr} ran its fallback`)
  }
  // ...and is, once everything before it came up empty, only as far as needed
  const { out, calls } = await withSpy('${opt:nope, spy:a, spy:b}')
  assert.is(out, 'from-spy')
  assert.equal(calls, ['spy:a'])
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
