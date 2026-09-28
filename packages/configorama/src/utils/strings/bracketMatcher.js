/**
 * Finds all outermost matching brace pairs in a string
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character (default: '{')
 * @param {string} closeChar - The closing character (default: '}')
 * @param {string} prefix - Optional prefix before opening char (e.g., '$' for '${')
 * @returns {Array<string>} Array of matched substrings including delimiters
 */
function findOutermostBraces(text, openChar = '{', closeChar = '}', prefix = '') {
  const matches = []
  let i = 0
  const openPattern = prefix + openChar

  while (i < text.length) {
    // Check if we have a match at this position
    const checkLen = openPattern.length
    if (text.substring(i, i + checkLen) === openPattern) {
      let depth = 1
      let start = i
      i += checkLen

      while (i < text.length && depth > 0) {
        if (text[i] === openChar) {
          depth++
        } else if (text[i] === closeChar) {
          depth--
        }
        i++
      }

      if (depth === 0) {
        matches.push(text.substring(start, i))
      }
    } else {
      i++
    }
  }

  return matches
}

/**
 * Finds the [start, end) index range of every outermost matching brace pair
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character
 * @param {string} closeChar - The closing character
 * @returns {Array<[number, number]>} Ranges; text.slice(start, end) includes delimiters
 */
function findOutermostBraceRanges(text, openChar = '{', closeChar = '}') {
  /** @type {Array<[number, number]>} */
  const ranges = []
  let depth = 0
  let startIndex = -1

  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) {
      if (depth === 0) {
        startIndex = i
      }
      depth++
    } else if (text[i] === closeChar) {
      depth--
      if (depth === 0 && startIndex !== -1) {
        ranges.push([startIndex, i + 1])
        startIndex = -1
      }
    }
  }

  return ranges
}

/**
 * Alternative implementation for finding outermost braces using depth tracking
 * Optimized for simple bracket matching without prefix
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character
 * @param {string} closeChar - The closing character
 * @returns {Array<string>} Array of matched substrings including delimiters
 */
function findOutermostBracesDepthFirst(text, openChar = '{', closeChar = '}') {
  return findOutermostBraceRanges(text, openChar, closeChar).map(([start, end]) => text.substring(start, end))
}

/**
 * Finds outermost variables with ${} syntax
 * @param {string} text - The text to search
 * @returns {Array<string>} Array of matched variables including ${}
 */
function findOutermostVariables(text) {
  return findOutermostBraces(text, '{', '}', '$')
}

/**
 * Find the outermost variable in text that contains the given variable occurrence.
 * A nested variable's fallback lives in its enclosing variable, never in literal text
 * outside every variable.
 * @param {string} text - The text containing the variable
 * @param {string} variable - The variable to locate (including prefix/suffix)
 * @param {string} prefix - Variable syntax prefix (e.g. '${')
 * @param {string} suffix - Variable syntax suffix (e.g. '}'); must be one character
 * @param {number} [index] - Index of the occurrence in text. The same variable can sit
 *   in different enclosing variables (${a, ${x}, 'fb'} ${x}); without an index the
 *   first occurrence is used.
 * @returns {string|null} The enclosing outermost variable, or null if not determinable
 */
function findEnclosingVariable(text, variable, prefix, suffix, index) {
  if (!prefix || !suffix || suffix.length !== 1) return null
  const outermost = findOutermostBraces(text, prefix.slice(-1), suffix, prefix.slice(0, -1))
  if (typeof index !== 'number') {
    const enclosing = outermost.find((match) => match.indexOf(variable) > -1)
    return enclosing || null
  }
  if (text.slice(index, index + variable.length) !== variable) return null
  // Outermost matches are ordered and non-overlapping, so each starts at the first
  // occurrence of its text after the previous match ends.
  let cursor = 0
  for (const match of outermost) {
    const start = text.indexOf(match, cursor)
    cursor = start + match.length
    if (start <= index && index + variable.length <= cursor) return match
  }
  return null
}

/**
 * Find the innermost variable around the occurrence of `variable` at `index`: its direct
 * parent, e.g. `${env:C, ${env:D}}` for `${env:D}` in `${env:A, ${env:C, ${env:D}}}`,
 * where findEnclosingVariable gives the outermost one.
 * @param {string} text - The text containing the variable
 * @param {string} variable - The variable occurrence (including prefix/suffix)
 * @param {string} prefix - Variable syntax prefix (e.g. '${')
 * @param {string} suffix - Variable syntax suffix; must be one character
 * @param {number} index - Index of the occurrence in text
 * @returns {{ start: number, text: string }|null} The parent variable and where it starts, or null
 */
function findParentVariable(text, variable, prefix, suffix, index) {
  if (!prefix || !suffix || suffix.length !== 1) return null
  if (text.slice(index, index + variable.length) !== variable) return null
  const end = index + variable.length
  /** @type {number[]} */
  const opens = []
  /** @type {{ start: number, text: string }|null} */
  let parent = null
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith(prefix, i)) {
      opens.push(i)
      i += prefix.length - 1
    } else if (text[i] === suffix && opens.length) {
      const start = /** @type {number} */ (opens.pop())
      // Spans close innermost first, so the first one around the occurrence is its parent
      if (start < index && i + 1 >= end) {
        parent = { start, text: text.slice(start, i + 1) }
        break
      }
    }
  }
  return parent
}

/**
 * Whether `variable` sits in a fallback slot of the `enclosing` variable expression:
 * after a top-level comma of a plain variable (${env:X, ${self:y}}), not inside a
 * function call's arguments (${merge('a', ${self:y})}), where commas separate arguments.
 * @param {string} enclosing - Enclosing variable text, e.g. '${env:X, ${self:y}}'
 * @param {string} variable - The nested variable text, e.g. '${self:y}'
 * @param {string} prefix - Variable prefix
 * @param {string} suffix - Variable suffix
 * @returns {boolean}
 */
function isFallbackSlot(enclosing, variable, prefix, suffix) {
  if (!enclosing || !enclosing.startsWith(prefix) || !enclosing.endsWith(suffix)) return false
  const inner = enclosing.slice(prefix.length, enclosing.length - suffix.length)
  if (/^\s*[A-Za-z_][\w.]*\s*\(/.test(inner)) return false
  const at = inner.indexOf(variable)
  if (at <= 0) return false
  const before = inner.slice(0, at)
  let depth = 0
  let quote = ''
  for (const ch of before) {
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
  }
  return depth === 0 && !quote && before.trimEnd().endsWith(',')
}

module.exports = {
  isFallbackSlot,
  findParentVariable,
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findOutermostBraceRanges,
  findOutermostVariables,
  findEnclosingVariable
}
