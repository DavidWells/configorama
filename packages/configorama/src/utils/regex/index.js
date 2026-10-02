/**
 * Shared regex patterns and utilities
 */

/**
 * Parse a function call with balanced parentheses support
 * Returns a regex-exec-like array: [fullMatch, funcName, args] with index and input properties
 * or null if no function found
 * @param {string} str - String to search for function call
 * @returns {RegExpExecArray|null} Regex-like result array or null
 */
function parseFunctionCall(str) {
  if (typeof str !== 'string' || !str.includes('(')) return null
  const syntax = require('../expressions/scan').scan(str)
  const call = syntax.nodes.find(n => n.kind === 'Call' && n.complete)
  if (!call) return null
  let end = call.end
  while (end < str.length && /\s/.test(str[end])) end++
  return Object.assign(/** @type {[string, string, string]} */ ([str.slice(call.start,end),call.name,str.slice(call.contentStart,call.contentEnd).trim() || undefined]), {index:call.start,input:str})
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

const fileRefSyntax = /^file\((~?[@\{\}\:\$a-zA-Z0-9._\-\/\\%,'" =+]+?)\)/g
const textRefSyntax = /^text\((~?[@\{\}\:\$a-zA-Z0-9._\-\/\\%,'" =+]+?)\)/g

module.exports = {
  funcRegex,
  fileRefSyntax,
  textRefSyntax,
  combineRegexes,
  parseFunctionCall,
  // Alias used by valueFromGit
  functionRegex: funcRegex
}
