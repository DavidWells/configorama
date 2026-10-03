const mapData = require('../mapData')
// Encodes variable-syntax chars ({ } $ for ${...}) that are plain text inside a ${...}
// expression, so they can't end, start or break it; decoded when the text becomes a value
const { setOwn } = require('../objects')
const opaque = require('./opaque')
// Chars that would split a key pasted into a variable's path (a paren hides the commas after it)
const PATH_CHARS = /[|:'"()\s]/

/**
 * Placeholder for one char: letters, digits and underscores only, which every variable
 * syntax accepts inside an expression
 * @param {string} ch - Char to encode
 * @returns {string} Placeholder text
 */
function placeholder(ch) {
  return opaque.encode('L', ch)
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
/** @returns {{encode:number[], refs:import('../expressions/scan').SyntaxNode[]}} */
function literalEncodingIndexes(str, prefix, suffix) {
  const {scan,parentReference,references}=require('../expressions/scan')
  const syntax=scan(str,{prefix,suffix});const refs=references(syntax).filter(n=>n.complete)
  const special=syntaxChars(prefix,suffix);const encode=[]
  for(const node of syntax.nodes) {
    if(!node.complete||!parentReference(syntax,node))continue
    const quoted=(node.kind==='Literal'||node.kind==='Composition')&&/^['"]/.test(node.raw)
    const path=node.kind==='Call'&&(node.name==='file'||node.name==='text')
    if(!quoted&&!path)continue
    const start=quoted?node.start+1:node.contentStart;const end=quoted?node.end-1:node.contentEnd
    const live=refs.filter(ref=>ref.start>=start&&ref.end<=end)
    for(let i=start;i<end;i++)if(!live.some(ref=>ref.start<=i&&ref.end>i)&&special.has(str[i]))encode.push(i)
  }
  return {encode,refs}
}
function encodeQuotedLiterals(str, prefix = '${', suffix = '}') {
  if(typeof str!=='string'||!str.includes(prefix))return str
  return applyEncoding(str,literalEncodingIndexes(str,prefix,suffix).encode)
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
 * With `path`, the chars that separate fallbacks, filters, sources and quoted literals
 * (, | : quotes, parens, whitespace) are encoded too: a value pasted into a key path
 * (${self:map.${opt:k}} -> ${self:map.a,b}) is one key, decoded before the lookup. Dots stay
 * path separators.
 * @param {{ commas?: boolean, path?: boolean }} [options]
 * @returns {string} Encoded string
 */
function encodeStrayVariableChars(str, prefix = '${', suffix = '}', options = {}) {
  if(typeof str!=='string')return str
  const {encode,refs}=literalEncodingIndexes(str,prefix,suffix);const special=syntaxChars(prefix,suffix)
  for(let i=0;i<str.length;i++)if(!refs.some(ref=>ref.start<=i&&ref.end>i)) {
    if(special.has(str[i])||((options.commas||options.path)&&str[i]===',')||(options.path&&PATH_CHARS.test(str[i])))encode.push(i)
  }
  return applyEncoding(str,encode)
}

/**
 * Whether a string holds encoded syntax chars
 * @param {any} value - Value to check
 * @returns {boolean} True if it contains placeholders
 */
function hasLiteralBraces(value) {
  return opaque.has(value, 'L')
}

/**
 * Decode placeholders back to their chars; non-strings pass through
 * @param {any} value - Value to decode
 * @returns {any} Decoded value
 */
function decodeLiteralBraces(value) {
  if (!hasLiteralBraces(value)) return value
  return opaque.decode(value, 'L')
}

/**
 * Decode placeholders in every string and object key of a plain object/array tree
 * (metadata is keyed by variable text; the preprocessed original config); other values
 * pass through
 * @param {any} value - Value to decode
 * @returns {any} Decoded copy
 */
function decodeLiteralBracesDeep(value) {
  return mapData(value, decodeLiteralBraces, decodeLiteralBraces)
}

/**
 * encodeQuotedLiterals for every string of a plain object/array tree (a raw config)
 * @param {any} value - Value to encode
 * @param {string} [prefix='${'] - Variable prefix
 * @param {string} [suffix='}'] - Variable suffix
 * @returns {any} Encoded copy
 */
function encodeQuotedLiteralsDeep(value, prefix = '${', suffix = '}') {
  return mapData(value, text => encodeQuotedLiterals(text, prefix, suffix))
}

/** @type {typeof import('./js-fixes') | undefined} */
let jsFixes

/**
 * decodeLiteralBracesDeep for metadata shown to people: also turns encoded fallback values
 * (__JSON_B64__...__) back into their JSON text. Not for resolved config values, where such
 * text could be the value itself
 * @param {any} value - Metadata to decode
 * @returns {any} Decoded copy
 */
function decodeForDisplay(value) {
  // Resolved once, not per node of the tree (still lazy: most loads never display metadata)
  const decodeJsonInVariable = jsFixes ? jsFixes.decodeJsonInVariable : (jsFixes = require('./js-fixes')).decodeJsonInVariable
  return mapData(value, text => opaque.decodeAll(text), text => opaque.decodeAll(text))
}

module.exports = {
  decodeForDisplay,
  decodeLiteralBracesDeep,
  encodeQuotedLiteralsDeep,
  encodeQuotedLiterals,
  encodeStrayVariableChars,
  decodeLiteralBraces,
  hasLiteralBraces,
}
