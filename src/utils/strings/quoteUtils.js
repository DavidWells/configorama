/**
 * Quote manipulation utilities for string handling
 */

/**
 * Removes surrounding quotes (single, double, or backtick) from a string
 * @param {string} str - The string to trim
 * @param {boolean} includeBackticks - Whether to also trim backticks (default: true)
 * @returns {string} The trimmed string
 */
function trimSurroundingQuotes(str = '', includeBackticks = true) {
  let result = str
    .replace(/^(")([^"\n]*?)(\1)$/, "$2")
    .replace(/^(')([^'\n]*?)(\1)$/, "$2")

  if (includeBackticks) {
    result = result.replace(/^(`)([^`\n]*?)(\1)$/, "$2")
  }

  return result
}

/**
 * Checks if a string starts with the given character
 * @param {string} str - The string to check
 * @param {string} char - The character to check for
 * @returns {string} Empty string if starts with char, otherwise the char
 */
function startChar(str, char) {
  return (str[0] === char) ? '' : char
}

/**
 * Checks if a string ends with the given character
 * @param {string} str - The string to check
 * @param {string} char - The character to check for
 * @returns {string} Empty string if ends with char, otherwise the char
 */
function endChar(str, char) {
  return (str[str.length - 1] === char) ? '' : char
}

/**
 * Ensures a value (string or array of strings) has quotes around it
 * @param {string|string[]} value - The value to quote
 * @param {string} [open] - Opening quote character (default: '"')
 * @param {string} [close] - Closing quote character (default: same as open)
 * @returns {string|string[]} The quoted value(s)
 */
function ensureQuote(value, open = '"', close) {
  let i = -1
  const result = []
  const end = close || open
  if (typeof value === 'string') {
    return startChar(value, open) + value + endChar(value, end)
  }
  while (++i < value.length) {
    result[i] = startChar(value[i], open) + value[i] + endChar(value[i], end)
  }
  return result
}

/**
 * Checks if a string is surrounded by matching quotes (single or double)
 * @param {string} str - The string to check
 * @returns {boolean} True if surrounded by matching quotes
 */
function isSurroundedByQuotes(str) {
  if (!str || str.length < 2) return false
  const firstChar = str[0]
  const lastChar = str[str.length - 1]
  return (firstChar === "'" && lastChar === "'") || (firstChar === '"' && lastChar === '"')
}

/**
 * Checks if a string starts with a quoted value followed by a pipe
 * @param {string} str - The string to check
 * @returns {boolean} True if matches pattern like 'xyz' | or "xyz" |
 */
function startsWithQuotedPipe(str) {
  return /^(['"])(.*?)\1\s*\|/.test(str)
}

module.exports = {
  trimSurroundingQuotes,
  ensureQuote,
  isSurroundedByQuotes,
  startsWithQuotedPipe
}
