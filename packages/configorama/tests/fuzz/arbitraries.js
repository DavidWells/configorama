/* fast-check generators for configorama values and expressions */
const { fc } = require('./fuzzUtils')

/* Characters that mean something in variable syntax, YAML, filters or fallbacks */
const SYNTAX_CHARS = [',', '|', "'", '"', '(', ')', '{', '}', '[', ']', '$', ':', '.', '#', '\\', ' ', '=', '&', '*', '!', '%', '@', '`', '\t']
/* Text that looks like configorama's own internal placeholders */
const TOKENS = ['__CFG_C44__', '__JSON_B64__eA==__', '__PLACEHOLDER_0__', '__PH_PAREN_OPEN__', '>passthrough', '> function ',
  'true', 'false', 'null', '123', '-1.5', '0x1f', 'self:', 'env:', 'opt:', ' | toUpperCase', "'q'", 'a, b']

/** A string weighted towards syntax characters and internal-looking tokens */
const syntaxString = fc.array(
  fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...SYNTAX_CHARS) },
    { weight: 3, arbitrary: fc.constantFrom('a', 'b', 'x', 'Z', '0', '9', '_', '-') },
    { weight: 1, arbitrary: fc.constantFrom(...TOKENS) },
  ),
  { maxLength: 12 },
).map((parts) => parts.join(''))

/** Any string value a config might hold. Excludes live variable syntax, which is meant to resolve */
const stringValue = fc.oneof(
  { weight: 5, arbitrary: syntaxString },
  { weight: 1, arbitrary: fc.string({ maxLength: 10 }) },
).filter((s) => !s.includes('${') && !s.includes('\u0000'))

/** Any JSON value: what a self: reference can point at */
const jsonValue = fc.oneof(
  { weight: 6, arbitrary: stringValue },
  { weight: 1, arbitrary: fc.integer({ min: -1000, max: 1000 }) },
  { weight: 1, arbitrary: fc.boolean() },
  { weight: 1, arbitrary: fc.array(stringValue, { maxLength: 3 }) },
  { weight: 1, arbitrary: fc.dictionary(fc.constantFrom('a', 'b', 'k'), stringValue, { maxKeys: 2 }) },
)

module.exports = { syntaxString, stringValue, jsonValue, SYNTAX_CHARS }
