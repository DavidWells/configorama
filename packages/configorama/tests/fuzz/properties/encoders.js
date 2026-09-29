/* Property: the string utilities that protect values inside expressions round-trip.      */
/* Pure functions, no resolution, so these run fast and find a bug at its source.          */
/* eslint-disable no-template-curly-in-string */
const { fc, PropertyFailure } = require('../fuzzUtils')
const { stringValue, jsonValue } = require('../arbitraries')
const { encodeStrayVariableChars, decodeLiteralBraces } = require('../../../src/utils/encoders/literal-braces')
const { encodeJsonForVariable, parseEncodedJson } = require('../../../src/utils/encoders/js-fixes')
const { splitOnPipe } = require('../../../src/utils/strings/splitOnPipe')
const { splitByComma } = require('../../../src/utils/strings/splitByComma')

/** @type {import('fast-check').Arbitrary<{ s: string, v: any, commas: boolean }>} */
const arbitrary = fc.record({ s: stringValue, v: jsonValue, commas: fc.boolean() })

/**
 * @param {{ s: string, v: any, commas: boolean }} c
 */
async function check({ s, v, commas }) {
  const encoded = encodeStrayVariableChars(s, '${', '}', { commas })
  if (decodeLiteralBraces(encoded) !== s) {
    throw new PropertyFailure('encodeStrayVariableChars does not round-trip', { s, encoded, decoded: decodeLiteralBraces(encoded) })
  }
  if (/[${}]/.test(encoded) || (commas && encoded.includes(','))) {
    throw new PropertyFailure('encodeStrayVariableChars leaves syntax chars', { s, encoded, commas })
  }
  const token = encodeJsonForVariable(v)
  if (JSON.stringify(parseEncodedJson(token)) !== JSON.stringify(v)) {
    throw new PropertyFailure('encodeJsonForVariable does not round-trip', { v, token, parsed: parseEncodedJson(token) })
  }
  if (!/^[\w+/=]+$/.test(token)) throw new PropertyFailure('encoded value token has syntax chars', { v, token })
  // A single-quoted item is one item for both splitters, whatever it holds
  if (!s.includes("'") && !s.includes('\\')) {
    const quoted = `'${s}'`
    const pipes = splitOnPipe(quoted)
    if (pipes.length !== 1) throw new PropertyFailure('splitOnPipe splits inside quotes', { quoted, parts: pipes })
    const commasSplit = splitByComma(`env:X, ${quoted}`)
    if (commasSplit.length !== 2 || commasSplit[1] !== quoted) {
      throw new PropertyFailure('splitByComma splits inside quotes', { input: `env:X, ${quoted}`, parts: commasSplit })
    }
  }
}

module.exports = { name: 'encoder round-trips', runs: 1000, arbitrary, check }
