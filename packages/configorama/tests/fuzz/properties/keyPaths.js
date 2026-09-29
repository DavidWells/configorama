/* Property: a key built from another variable is one key, whatever it holds.              */
/* ${self:map.${opt:k}} gives map[k], or fails, but never another entry's value.            */
/* Regression class: a key of 'a,b,c' was read as a fallback list and returned map.b.      */
/* Dots stay path separators (${self:${opt:path}} with path custom.x is a nested lookup),  */
/* so generated keys hold no dots or brackets.                                              */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { stringValue } = require('../arbitraries')

const SOURCES = ['${opt:k}', '${env:CONFIGORAMA_FUZZ_KEY}', '${self:key}']

/** @type {import('fast-check').Arbitrary<{ k: string, source: number, decoys: string[], fallback: boolean }>} */
const arbitrary = fc.record({
  k: stringValue.filter((s) => s.trim() !== '' && !/[.[\]]/.test(s) && !s.includes('__CFG_C')),
  source: fc.integer({ min: 0, max: SOURCES.length - 1 }),
  // Other keys the lookup could wrongly land on: pieces of k
  decoys: fc.constant([]),
  fallback: fc.boolean(),
}).map((c) => Object.assign(c, {
  decoys: [...new Set(c.k.split(/[,|:\s'"]+/).map((p) => p.trim()).filter((p) => p && p !== c.k && !/[.[\]]/.test(p)))],
}))

/**
 * @param {{ k: string, source: number, decoys: string[], fallback: boolean }} c
 */
async function check(c) {
  process.env.CONFIGORAMA_FUZZ_KEY = c.k
  const map = [`  ${JSON.stringify(c.k)}: found`, ...c.decoys.map((d) => `  ${JSON.stringify(d)}: wrong-entry`)].join('\n')
  const expr = c.fallback ? `\${self:map.${SOURCES[c.source]}, 'fallback'}` : `\${self:map.${SOURCES[c.source]}}`
  const yml = `key: ${JSON.stringify(c.k)}\nmap:\n${map}\nout: ${JSON.stringify(expr)}\n`
  const res = await resolveBoth(yml, { options: { k: c.k } }, { sync: false })
  const detail = { key: c.k, expr, got: describe(res.async) }
  if (!res.async.ok) throw new PropertyFailure('throws for a key that exists', detail)
  if (res.async.value.out !== 'found') throw new PropertyFailure('returns another entry', detail)
}

module.exports = { name: 'key paths', runs: 150, arbitrary, check }
