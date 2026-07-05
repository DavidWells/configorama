/* Quote-aware string processing utilities */

/**
 * Find index of a character/pattern outside of quoted strings
 * @param {string} str - String to search
 * @param {string|function} matcher - Char to find, or function(str, idx) => matchLength|0
 * @param {number} [startIdx=0] - Start index
 * @returns {number} Index of match, or -1 if not found
 */
function findOutsideQuotes(str, matcher, startIdx = 0) {
  let inQuote = false
  let quoteChar = ''

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i]

    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
    } else if (inQuote && ch === quoteChar) {
      inQuote = false
    } else if (!inQuote) {
      if (typeof matcher === 'function') {
        const matchLen = matcher(str, i)
        if (matchLen > 0) return i
      } else if (ch === matcher) {
        return i
      }
    }
  }

  return -1
}

/**
 * Replace a pattern only outside of quoted strings
 * @param {string} str - String to process
 * @param {string|RegExp} pattern - Pattern to match (if string, must be exact match)
 * @param {string|function} replacement - Replacement string or function(match) => string
 * @returns {string} Processed string
 */
function replaceOutsideQuotes(str, pattern, replacement) {
  let result = ''
  let inQuote = false
  let quoteChar = ''
  let i = 0

  const patternStr = typeof pattern === 'string' ? pattern : null
  const patternLen = patternStr ? patternStr.length : 0

  while (i < str.length) {
    const ch = str[i]

    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
      result += ch
      i++
    } else if (inQuote && ch === quoteChar) {
      inQuote = false
      result += ch
      i++
    } else if (!inQuote && patternStr) {
      // String pattern - check for exact match with word boundaries
      if (str.substring(i, i + patternLen) === patternStr) {
        const before = i === 0 || !/\w/.test(str[i - 1])
        const after = i + patternLen >= str.length || !/\w/.test(str[i + patternLen])
        if (before && after) {
          const rep = typeof replacement === 'function' ? replacement(patternStr) : replacement
          result += rep
          i += patternLen
          continue
        }
      }
      result += ch
      i++
    } else {
      result += ch
      i++
    }
  }

  return result
}

/**
 * Check if an index is inside a quoted string
 * @param {string} str - String to check
 * @param {number} idx - Index to check
 * @returns {boolean} True if index is inside quotes
 */
function isInsideQuotes(str, idx) {
  let inQuote = false
  let quoteChar = ''

  for (let i = 0; i < str.length && i <= idx; i++) {
    const ch = str[i]
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
    } else if (inQuote && ch === quoteChar) {
      inQuote = false
    }
  }

  return inQuote
}

/**
 * Get ranges of quoted strings in a string
 * @param {string} str - String to analyze
 * @returns {Array<[number, number]>} Array of [start, end] ranges
 */
function getQuoteRanges(str) {
  /** @type {Array<[number, number]>} */
  const ranges = []
  let inQuote = false
  let quoteChar = ''
  let quoteStart = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true
      quoteChar = ch
      quoteStart = i
    } else if (inQuote && ch === quoteChar) {
      ranges.push([quoteStart, i + 1])
      inQuote = false
    }
  }

  return ranges
}

module.exports = {
  findOutsideQuotes,
  replaceOutsideQuotes,
  isInsideQuotes,
  getQuoteRanges
}
