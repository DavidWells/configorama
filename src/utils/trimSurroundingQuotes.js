/**
 * Removes surrounding quotes (single, double, or backtick) from a string
 * @param {string} str - The string to trim
 * @param {boolean} includeBackticks - Whether to also trim backticks (default: true)
 * @returns {string} The trimmed string
 */
module.exports = function trimQuotes(str = '', includeBackticks = true) {
  let result = str
    .replace(/^(")([^"\n]*?)(\1)$/, "$2")
    .replace(/^(')([^'\n]*?)(\1)$/, "$2")

  if (includeBackticks) {
    result = result.replace(/^(`)([^`\n]*?)(\1)$/, "$2")
  }

  return result
}