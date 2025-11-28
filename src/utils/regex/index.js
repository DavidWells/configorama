/**
 * Shared regex patterns and utilities
 */

const funcRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const funcStartOfLineRegex = /^(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const subFunctionRegex = /(\w+):(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/

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
  funcStartOfLineRegex,
  subFunctionRegex,
  combineRegexes,
  // Keep old export name for backwards compat
  functionRegex: funcRegex
}
