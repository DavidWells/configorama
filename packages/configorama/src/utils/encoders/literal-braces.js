// Encodes variable-syntax chars ({ } $ for ${...}) that are plain text inside a ${...}
// expression, so they can't end, start or break it; decoded when the text becomes a value
const PLACEHOLDER_PATTERN = /__CFG_C(\d+)__/g
const WORD_CHAR = /[A-Za-z0-9_.)\]]/

/**
 * Placeholder for one char: letters, digits and underscores only, which every variable
 * syntax accepts inside an expression
 * @param {string} ch - Char to encode
 * @returns {string} Placeholder text
 */
function placeholder(ch) {
  return `__CFG_C${ch.charCodeAt(0)}__`
}

/**
 * Whether placeholder-looking text starts at idx. Its first `_` is encoded too, so
 * decoding gives back the text as written instead of a syntax char.
 * @param {string} str - Text being scanned
 * @param {number} idx - Index to check
 * @returns {boolean} True if __CFG_C starts here
 */
function startsPlaceholder(str, idx) {
  return str.startsWith('__CFG_C', idx)
}

/**
 * Chars that make up the variable syntax (e.g. $ { } for ${...})
 * @param {string} prefix - Variable prefix, e.g. '${'
 * @param {string} suffix - Variable suffix, e.g. '}'
 * @returns {Set<string>} Chars that must not appear raw inside an expression
 */
function syntaxChars(prefix, suffix) {
  return new Set((prefix + suffix).split(''))
}

/**
 * @typedef {{ prefix: string, suffix: string, special: Set<string> }} Syntax
 * @typedef {{ end: number, encode: number[] }} Scan
 */

/**
 * Scan a quoted literal opening at start. Well-formed variables inside it stay live;
 * other syntax chars are marked for encoding.
 * @param {string} str - Text being scanned
 * @param {number} start - Index of the opening quote
 * @param {Syntax} syntax - Variable syntax
 * @returns {Scan|null} Index after the closing quote and indexes to encode, or null if unclosed
 */
function scanQuoted(str, start, syntax) {
  const quote = str[start]
  /** @type {number[]} */
  const encode = []
  let i = start + 1
  while (i < str.length) {
    const ch = str[i]
    if (ch === '\\') {
      // \' and \" are escaped quotes in either quote style, as the quoted-literal resolver reads them
      i += 2
    } else if (ch === quote) {
      return { end: i + 1, encode }
    } else if (str.startsWith(syntax.prefix, i)) {
      const nested = scanVariable(str, i, syntax, quote)
      if (nested) {
        encode.push(...nested.encode)
        i = nested.end
      } else {
        for (let k = 0; k < syntax.prefix.length; k++) {
          if (syntax.special.has(str[i + k])) encode.push(i + k)
        }
        i += syntax.prefix.length
      }
    } else {
      if (syntax.special.has(ch) || startsPlaceholder(str, i)) encode.push(i)
      i++
    }
  }
  return null
}

/**
 * Scan a file()/text() path argument from just after its `(` to the matching `)`. A path
 * is literal text: syntax chars in it are marked for encoding, while variables inside it
 * (./config.${stage}.json) and quoted paths are scanned as usual.
 * @param {string} str - Text being scanned
 * @param {number} start - Index just after the opening paren
 * @param {Syntax} syntax - Variable syntax
 * @returns {Scan|null} Index after the closing paren and indexes to encode, or null if unclosed
 */
function scanPathArgument(str, start, syntax) {
  /** @type {number[]} */
  const encode = []
  let depth = 1
  let i = start
  while (i < str.length) {
    const ch = str[i]
    if (str.startsWith(syntax.prefix, i)) {
      const nested = scanVariable(str, i, syntax)
      if (!nested) return null
      encode.push(...nested.encode)
      i = nested.end
      continue
    }
    if ((ch === "'" || ch === '"') && i === start) {
      const quoted = scanQuoted(str, i, syntax)
      if (!quoted) return null
      encode.push(...quoted.encode)
      i = quoted.end
      continue
    }
    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return { end: i + 1, encode }
    } else if (syntax.special.has(ch) || startsPlaceholder(str, i)) {
      encode.push(i)
    }
    i++
  }
  return null
}

/**
 * Scan a variable expression opening at start, marking syntax chars inside its quoted
 * literals for encoding
 * @param {string} str - Text being scanned
 * @param {number} start - Index of the variable prefix
 * @param {Syntax} syntax - Variable syntax
 * @param {string|null} [stopQuote] - When scanning inside a quoted literal, its quote char;
 *   a variable that would cross it is not well formed
 * @returns {Scan|null} Index after the variable and indexes to encode, or null if unclosed
 */
function scanVariable(str, start, syntax, stopQuote = null) {
  /** @type {number[]} */
  const encode = []
  let prev = syntax.prefix[syntax.prefix.length - 1]
  let i = start + syntax.prefix.length
  while (i < str.length) {
    const ch = str[i]
    if (str.startsWith(syntax.prefix, i)) {
      const nested = scanVariable(str, i, syntax, stopQuote)
      if (!nested) return null
      encode.push(...nested.encode)
      i = nested.end
      prev = syntax.suffix[syntax.suffix.length - 1]
      continue
    }
    if (str.startsWith(syntax.suffix, i)) return { end: i + syntax.suffix.length, encode }
    if (ch === stopQuote) return null
    // A file()/text() path is literal text up to its closing paren
    const pathCall = !WORD_CHAR.test(prev) && (str.startsWith('file(', i) || str.startsWith('text(', i))
    if (pathCall) {
      const pathArg = scanPathArgument(str, i + 5, syntax)
      if (pathArg) {
        encode.push(...pathArg.encode)
        i = pathArg.end
        prev = ')'
        continue
      }
    }
    // A quote opens a literal where an item starts, not mid-word (it's)
    if ((ch === "'" || ch === '"') && !WORD_CHAR.test(prev)) {
      const quoted = scanQuoted(str, i, syntax)
      if (quoted) {
        encode.push(...quoted.encode)
        i = quoted.end
        prev = ch
        continue
      }
    }
    if (!/\s/.test(ch)) prev = ch
    i++
  }
  return null
}

/**
 * Replace the chars at the given indexes with placeholders
 * @param {string} str - Text to encode
 * @param {number[]} indexes - Indexes of chars to encode
 * @returns {string} Encoded text
 */
function applyEncoding(str, indexes) {
  if (!indexes.length) return str
  const at = new Set(indexes)
  let out = ''
  for (let i = 0; i < str.length; i++) out += at.has(i) ? placeholder(str[i]) : str[i]
  return out
}

/**
 * Encode syntax chars inside quoted literals and file()/text() paths of every variable
 * expression in str: ${opt:x, 'a}b'} keeps its quoted } from ending the expression, and
 * ${file(./{x}.json)} its path braces. Well-formed variables inside a literal or path
 * (${opt:x, '${self:y}-z'}) stay live.
 * @param {string} str - Config string value
 * @param {string} [prefix='${'] - Variable prefix
 * @param {string} [suffix='}'] - Variable suffix
 * @returns {string} Encoded string
 */
function encodeQuotedLiterals(str, prefix = '${', suffix = '}') {
  if (typeof str !== 'string' || str.indexOf(prefix) === -1) return str
  const hasLiteral = str.indexOf("'") !== -1 || str.indexOf('"') !== -1 ||
    str.indexOf('file(') !== -1 || str.indexOf('text(') !== -1
  if (!hasLiteral) return str
  const syntax = { prefix, suffix, special: syntaxChars(prefix, suffix) }
  /** @type {number[]} */
  const encode = []
  let i = 0
  while (i < str.length) {
    if (str.startsWith(prefix, i)) {
      const scanned = scanVariable(str, i, syntax)
      if (scanned) {
        encode.push(...scanned.encode)
        i = scanned.end
        continue
      }
    }
    i++
  }
  return applyEncoding(str, encode)
}

/**
 * Encode syntax chars in a resolved value that is written inside another variable
 * expression ({name}-svc in ${opt:x, ${self:tpl}}). Well-formed variables in the value
 * (${deep:1}) stay live. With `commas`, commas are encoded too: a value pasted into a
 * fallback slot (${env:X, ${self:list}} -> ${env:X, a,b,c}) is one resolved result and
 * must not be re-read as more fallbacks.
 * @param {string} str - Resolved string value
 * @param {string} [prefix='${'] - Variable prefix
 * @param {string} [suffix='}'] - Variable suffix
 * @param {{ commas?: boolean }} [options]
 * @returns {string} Encoded string
 */
function encodeStrayVariableChars(str, prefix = '${', suffix = '}', options = {}) {
  if (typeof str !== 'string') return str
  const syntax = { prefix, suffix, special: syntaxChars(prefix, suffix) }
  /** @type {number[]} */
  const encode = []
  let i = 0
  while (i < str.length) {
    if (str.startsWith(prefix, i)) {
      const scanned = scanVariable(str, i, syntax)
      if (scanned) {
        encode.push(...scanned.encode)
        i = scanned.end
        continue
      }
    }
    if (syntax.special.has(str[i]) || (options.commas && str[i] === ',') || startsPlaceholder(str, i)) encode.push(i)
    i++
  }
  return applyEncoding(str, encode)
}

/**
 * Whether a string holds encoded syntax chars
 * @param {any} value - Value to check
 * @returns {boolean} True if it contains placeholders
 */
function hasLiteralBraces(value) {
  return typeof value === 'string' && value.indexOf('__CFG_C') !== -1
}

/**
 * Decode placeholders back to their chars; non-strings pass through
 * @param {any} value - Value to decode
 * @returns {any} Decoded value
 */
function decodeLiteralBraces(value) {
  if (!hasLiteralBraces(value)) return value
  return value.replace(PLACEHOLDER_PATTERN, (_, code) => String.fromCharCode(Number(code)))
}

/**
 * Decode placeholders in every string and object key of a plain object/array tree
 * (metadata is keyed by variable text; the preprocessed original config); other values
 * pass through
 * @param {any} value - Value to decode
 * @returns {any} Decoded copy
 */
function decodeLiteralBracesDeep(value) {
  if (typeof value === 'string') return decodeLiteralBraces(value)
  if (Array.isArray(value)) return value.map(decodeLiteralBracesDeep)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    /** @type {Record<string, any>} */
    const result = {}
    for (const key of Object.keys(value)) result[decodeLiteralBraces(key)] = decodeLiteralBracesDeep(value[key])
    return result
  }
  return value
}

/**
 * encodeQuotedLiterals for every string of a plain object/array tree (a raw config)
 * @param {any} value - Value to encode
 * @param {string} [prefix='${'] - Variable prefix
 * @param {string} [suffix='}'] - Variable suffix
 * @returns {any} Encoded copy
 */
function encodeQuotedLiteralsDeep(value, prefix = '${', suffix = '}') {
  if (typeof value === 'string') return encodeQuotedLiterals(value, prefix, suffix)
  if (Array.isArray(value)) return value.map((item) => encodeQuotedLiteralsDeep(item, prefix, suffix))
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    /** @type {Record<string, any>} */
    const result = {}
    for (const key of Object.keys(value)) result[key] = encodeQuotedLiteralsDeep(value[key], prefix, suffix)
    return result
  }
  return value
}

module.exports = {
  decodeLiteralBracesDeep,
  encodeQuotedLiteralsDeep,
  encodeQuotedLiterals,
  encodeStrayVariableChars,
  decodeLiteralBraces,
  hasLiteralBraces,
}
