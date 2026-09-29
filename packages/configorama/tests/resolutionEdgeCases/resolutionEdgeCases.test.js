/* Regressions found by the fuzz properties in tests/fuzz (round 2): filters after fallbacks, */
/* keys built from variables, values that look like internal markers, unknown functions,     */
/* whitespace and quote styles, and if()/eval() mixed with fallbacks.                        */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const UNSET = 'CONFIGORAMA_EDGE_UNSET'
const SET = 'CONFIGORAMA_EDGE_SET'

const HEADER = `custom:
  v: val
  port: 8080
  t: true
  s: 'val,ue|x'
  present: present
`

/**
 * Resolve one value next to the shared header keys
 * @param {string} expr - Expression for key out
 * @param {object} [settings] - configorama settings
 * @param {string} [extra] - More YAML
 * @returns {Promise<any>} The resolved out
 */
async function resolveOut(expr, settings, extra = '') {
  const config = await resolveYamlText(`${HEADER}${extra}out: ${JSON.stringify(expr)}\n`, settings)
  return config.out
}

test.before.each(() => {
  delete process.env[UNSET]
  process.env[SET] = '100'
})

test('a filter after a variable fallback applies to the winner', async () => {
  assert.is(await resolveOut('${opt:present, self:custom.nope | toUpperCase}', { options: { present: 'p' } }), 'P', 'primary wins, missing last item')
  assert.is(await resolveOut('${opt:present, opt:nope | toUpperCase}', { options: { present: 'p' } }), 'P')
  assert.is(await resolveOut('${opt:nope, self:custom.v | toUpperCase}'), 'VAL', 'last item wins')
  assert.is(await resolveOut(`\${env:${UNSET}, self:custom.port | String}`), '8080')
  assert.is(await resolveOut(`\${env:${SET}, self:custom.port | toNumber}`), 100, 'an env string made a number by its filter stays a number')
})

test('a missing fallback item leaves the rest of its list', async () => {
  assert.is(await resolveOut("${opt:nope, self:custom.nope, 'lit' | toUpperCase}"), 'LIT')
  let error
  try {
    await resolveOut('${opt:nope, self:custom.nope | toUpperCase}')
  } catch (err) {
    error = err
  }
  assert.ok(error, 'nothing resolves, so it fails')
})

test('a key built from a variable is one key', async () => {
  const keys = ['a,b,c', "'q', 'r'", 'a|b', 'a:b', '(', 'x) + (y', ' pad ', 'x}y', 'say "hi"']
  const map = keys.map((k) => `  ${JSON.stringify(k)}: found`).join('\n')
  for (const k of keys) {
    process.env[SET] = k
    const extra = `key: ${JSON.stringify(k)}\nmap:\n${map}\n  a: wrong\n  b: wrong\n  r: wrong\n`
    assert.is(await resolveOut('${self:map.${opt:k}}', { options: { k } }, extra), 'found', `opt key ${JSON.stringify(k)}`)
    assert.is(await resolveOut('${self:map.${self:key}}', {}, extra), 'found', `self key ${JSON.stringify(k)}`)
    assert.is(await resolveOut(`\${self:map.\${env:${SET}}, 'fallback'}`, {}, extra), 'found', `env key ${JSON.stringify(k)} with a fallback`)
  }
})

test('a value that looks like an internal marker comes back as written', async () => {
  for (const v of ['> function x', '> function \\', '>passthrough', '__PH_PAREN_OPEN__', '__PLACEHOLDER_0__', 'x > function y']) {
    process.env[SET] = v
    const extra = `marker: ${JSON.stringify(v)}\n`
    assert.is(await resolveOut('${self:marker}', {}, extra), v, `self ${JSON.stringify(v)}`)
    assert.is(await resolveOut('${opt:m}', { options: { m: v } }, extra), v, `opt ${JSON.stringify(v)}`)
    assert.is(await resolveOut(`\${env:${SET}}`, {}, extra), v, `env ${JSON.stringify(v)}`)
    assert.is(await resolveOut(`x=\${env:${UNSET}, self:marker}`, {}, extra), `x=${v}`, `fallback ${JSON.stringify(v)}`)
  }
})

/**
 * The error a resolution throws
 * @param {string} expr
 * @returns {Promise<string>}
 */
async function errorFor(expr) {
  try {
    await resolveOut(expr)
  } catch (err) {
    return err.message
  }
  return ''
}

test('an unknown function is an error that names it', async () => {
  const concat = await errorFor("${concat('a', 'b')}")
  assert.match(concat, 'Unknown function "concat"')
  assert.match(concat, 'Available functions: split, join, length, merge')
  assert.match(await errorFor("${mrege('a', 'b')}"), 'Did you mean "merge"?')
  assert.match(await errorFor("${toUpperCase('x')}"), '"toUpperCase" is a filter, not a function')
  assert.is(await resolveOut("${merge('a', 'b')}"), 'ab', 'known functions still run')
})

test('whitespace, tabs included, does not change the result', async () => {
  for (const expr of ['${env:U,self:custom.v}', '${ env:U , self:custom.v }', '${\tenv:U,\tself:custom.v\t}', '${self:custom.v\t}']) {
    assert.is(await resolveOut(expr), 'val', JSON.stringify(expr))
  }
  for (const expr of ["${env:U,'lit'|toUpperCase}", "${ env:U , 'lit' | toUpperCase }", "${env:U,\t'lit'\t|\ttoUpperCase}"]) {
    assert.is(await resolveOut(expr), 'LIT', JSON.stringify(expr))
  }
})

test("single and double quotes are interchangeable, \\' and \\\" in either", async () => {
  assert.is(await resolveOut("${env:U, 'it\\'s'}"), "it's")
  assert.is(await resolveOut('${env:U, "it\'s"}'), "it's")
  assert.is(await resolveOut('${env:U, "it\\\'s"}'), "it's", 'an escaped single quote inside double quotes')
  assert.is(await resolveOut("${env:U, 'say \\\"hi\\\"'}"), 'say "hi"', 'an escaped double quote inside single quotes')
  assert.is(await resolveOut('${env:U, "say \\"hi\\""}'), 'say "hi"')
})

test('an escaped quote before a paren in a filtered literal', async () => {
  assert.is(await resolveOut("${'\\'(' | toUpperCase}"), "'(")
  assert.is(await resolveOut("${'x\\'(' | toUpperCase}"), "X'(")
})

test('if() and eval() inside fallbacks, and fallbacks inside if()', async () => {
  assert.is(await resolveOut(`\${env:${UNSET}, \${if(\${self:custom.s} == 'val,ue|x')}}`), true)
  assert.is(await resolveOut(`\${env:${UNSET}, \${eval(1 == 1)}}`), true)
  assert.is(await resolveOut(`\${env:${UNSET}, \${if(1 > 0 ? "yes" : "no")}}`), 'yes', 'not "\\"yes\\""')
  assert.is(await resolveOut(`\${if(\${env:${UNSET}, \${self:custom.t}} == true)}`), true)
  assert.is(await resolveOut(`\${if(\${env:${UNSET}, \${self:custom.s}} == 'val,ue|x')}`), true)
})

test('a function call three levels into fallbacks resolves instead of looping', async () => {
  assert.is(await resolveOut(`\${self:custom.missing, \${env:${UNSET}, opt:nope, \${length(\${self:custom.s})}}}`), 8)
  assert.is(await resolveOut(`\${opt:nope, \${env:${UNSET}, \${merge(\${self:custom.v}, '!')}}}`), 'val!')
})

test.run()
