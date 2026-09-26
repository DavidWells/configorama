/* Fallbacks and filters inside composite strings: each variable's result replaces only */
/* that variable, quoted fallback text is literal, and keys never leak into each other.  */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')

const HEADER = `name: Bob
stage: dev
obj:
  a: 1
`

/**
 * Resolve one value next to the shared header keys
 * @param {string} value - YAML value text for key v
 * @param {object} [settings] - configorama settings
 * @returns {Promise<any>} The resolved v
 */
async function resolveValue(value, settings) {
  const config = await resolveYamlText(`${HEADER}v: ${value}\n`, settings)
  return config.v
}

// ==========================================
// Quoted fallback text is literal
// ==========================================

test('pipe inside a quoted fallback is not a filter', async () => {
  assert.is(await resolveValue(`\${opt:nope, 'a|b'}`), 'a|b')
  assert.is(await resolveValue(`s-\${opt:nope, 'a|b'}-s`), 's-a|b-s')
  assert.is(await resolveValue(`'s-\${opt:nope, "a|b"}-s'`), 's-a|b-s')
})

test('quoted fallback that looks like a filter is literal text', async () => {
  assert.is(await resolveValue('${opt:nope, "5432 | Number"}'), '5432 | Number')
  assert.is(await resolveValue(`\${opt:nope, '5432' | Number}`), 5432)
})

test('filter after an unquoted fallback applies to whichever value wins', async () => {
  assert.is(await resolveValue('${opt:port, 5432 | Number}'), 5432)
  assert.is(await resolveValue('${opt:port, 5432 | Number}', { options: { port: '6543' } }), 6543)
})

test('filter after a quoted fallback containing a pipe', async () => {
  assert.is(await resolveValue(`\${opt:nope, 'a|b' | toUpperCase}`), 'A|B')
})

// ==========================================
// Filters on a variable nested in a fallback
// ==========================================

test('filter on a nested fallback var applies to that var only', async () => {
  assert.is(await resolveValue(`\${name} x \${opt:nope, \${stage} | toUpperCase}`), 'Bob x DEV')
  assert.is(await resolveValue(`pre \${opt:nope, \${stage} | toUpperCase} post`), 'pre DEV post')
})

// ==========================================
// Objects as values and fallbacks
// ==========================================

test('object var at the start of a string is stringified like elsewhere', async () => {
  assert.is(await resolveValue('${self:obj} and text'), '{"a":1} and text')
  assert.is(await resolveValue('text and ${self:obj}'), 'text and {"a":1}')
  assert.is(await resolveValue('${self:obj} and ${stage}'), '{"a":1} and dev')
})

test('object as a fallback', async () => {
  assert.equal(await resolveValue('${opt:nope, ${self:obj}}'), { a: 1 })
  assert.equal(await resolveValue('${self:missingObj, ${self:obj}}'), { a: 1 })
})

test('object from a file as a fallback', async () => {
  const dataFile = path.join(__dirname, 'data.json')
  const missingFile = path.join(__dirname, 'nope.json')
  assert.equal(await resolveValue(`\${opt:nope, \${file(${dataFile})}}`), { k: 'v', n: 3 })
  assert.equal(await resolveValue(`\${file(${missingFile}), \${file(${dataFile})}}`), { k: 'v', n: 3 })
})

// ==========================================
// Keys don't leak into each other
// ==========================================

test('missing self-ref throws regardless of other keys and their order', async () => {
  for (const yml of [
    'b: "${zz}"\n',
    `a: "\${opt:nope, zz, 'q'}"\nb: "\${zz}"\n`,
    `b: "\${zz}"\na: "\${opt:nope, zz, 'q'}"\n`,
  ]) {
    try {
      await resolveYamlText(yml)
      assert.unreachable(`should throw for:\n${yml}`)
    } catch (err) {
      assert.instance(err, Error)
      assert.match(err.message, /Variable: "zz" from \$\{zz\} not found/)
      assert.match(err.message, /Key: "b"/)
    }
  }
})

test('bare-word fallback stays literal and does not leak into other keys', async () => {
  const config = await resolveYamlText(`a: "\${opt:nope, zz, 'q'}"\nb: "\${zz}"\n`, { allowUnknownVars: true })
  assert.is(config.a, 'zz')
  assert.is(config.b, '${zz}')
})

// ==========================================
// Working behaviors locked in
// ==========================================

test('same var with and without filters in one string', async () => {
  assert.is(await resolveValue('${name | toUpperCase}-${name}'), 'BOB-Bob')
  assert.is(await resolveValue('${name}-${name | toUpperCase}'), 'Bob-BOB')
  assert.is(await resolveValue('${name | toUpperCase}-${name | toLowerCase}'), 'BOB-bob')
})

test('empty and comma fallbacks in text', async () => {
  assert.is(await resolveValue(`"a\${opt:nope, ''}b\${opt:nope2, ''}c"`), 'abc')
  assert.is(await resolveValue(`"c-\${opt:nope, 'a,b'}-x"`), 'c-a,b-x')
})

test('number and boolean fallbacks: typed alone, stringified in text', async () => {
  assert.is(await resolveValue('${opt:nope, 3}'), 3)
  assert.is(await resolveValue('n-${opt:nope, 7}-x'), 'n-7-x')
  assert.is(await resolveValue('b-${opt:nope, true}-x'), 'b-true-x')
})

test('deeply nested fallbacks in text', async () => {
  assert.is(await resolveValue(`z-\${opt:a, \${opt:b, \${opt:c, 'deep'}}}-z`), 'z-deep-z')
  assert.is(await resolveValue('z-${opt:a, ${self:nope, ${stage}}}-z'), 'z-dev-z')
})

test('an object in a variable source slot still throws', async () => {
  try {
    await resolveValue('${env:${self:obj}}')
    assert.unreachable('should throw')
  } catch (err) {
    assert.instance(err, Error)
    assert.match(err.message, /Invalid variable syntax/)
  }
})

test.run()
