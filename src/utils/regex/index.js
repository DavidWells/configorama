/**
 * Shared regex patterns and utilities
 */

// Legacy regex patterns (can't handle nested parentheses properly)
const funcRegexSimple = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const funcStartOfLineRegex = /^(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const subFunctionRegex = /(\w+):(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/

/**
 * Parse a function call with balanced parentheses support
 * Returns a regex-exec-like array: [fullMatch, funcName, args] with index and input properties
 * or null if no function found
 * @param {string} str - String to search for function call
 * @returns {any} Regex-like result array or null
 */
function parseFunctionCall(str) {
  if (!str || typeof str !== 'string') return null
  
  // Find function name followed by opening paren
  const funcMatch = str.match(/(\w+)\s*\(/)
  if (!funcMatch) return null
  
  const funcName = funcMatch[1]
  const openParenIndex = funcMatch.index + funcMatch[0].length - 1
  const startPos = openParenIndex + 1
  
  let depth = 1
  let pos = startPos
  
  // Track parenthesis depth to find matching closing paren
  while (pos < str.length && depth > 0) {
    const char = str[pos]
    if (char === '(') depth++
    else if (char === ')') depth--
    pos++
  }
  
  if (depth !== 0) return null // Unbalanced parens
  
  const args = str.substring(startPos, pos - 1).trim()
  
  // Skip trailing whitespace for fullMatch
  let endPos = pos
  while (endPos < str.length && /\s/.test(str[endPos])) {
    endPos++
  }
  
  const fullMatch = str.substring(funcMatch.index, endPos)
  
  // Create regex-exec-like result array with index and input properties
  /** @type {any} */
  const result = [fullMatch, funcName, args || undefined]
  result.index = funcMatch.index
  result.input = str
  return result
}

/**
 * Enhanced funcRegex that handles nested parentheses
 * Mimics RegExp interface with exec() method
 */
const funcRegex = {
  exec: parseFunctionCall,
  test: (str) => parseFunctionCall(str) !== null,
  // Keep source for compatibility (shows what pattern we're conceptually matching)
  source: '(\\w+)\\s*\\((.*)\\)\\s*',
  toString: () => '/(\\w+)\\s*\\((.*)\\)\\s*/'
}

/**
 * Combine multiple regex patterns into single OR pattern
 * @param {RegExp[]} regexes - Array of regex patterns to combine
 * @returns {RegExp} Combined regex with OR operator
 */
function combineRegexes(regexes) {
  const patterns = regexes.map(regex => regex.source).filter(Boolean)
  return new RegExp(`(${patterns.join('|')})`)
}

module.exports = {
  funcRegex,
  funcRegexSimple,
  funcStartOfLineRegex,
  subFunctionRegex,
  combineRegexes,
  parseFunctionCall,
  // Keep old export name for backwards compat
  functionRegex: funcRegex
}
