/**
 * Get text after first occurrence of search string
 * @param {string} str - Source string
 * @param {string} search - String to search for
 * @returns {string} Text after search string or empty string if not found
 */
function getTextAfterOccurrence(str, search) {
  const index = str.indexOf(search)
  if (index === -1) return ''
  return str.substring(index)
}

/**
 * Find nested variable in split array that exists in original source
 * @param {string[]} split - Array of potential variables
 * @param {string} originalSource - Original source string
 * @returns {string|undefined} Found nested variable or undefined
 */
function findNestedVariable(split, originalSource) {
  return split.find((thing) => {
    if (originalSource && typeof originalSource === 'string') {
      return originalSource.indexOf(`\${${thing}}`) > -1
    }
    return false
  })
}

module.exports = {
  getTextAfterOccurrence,
  findNestedVariable
} 