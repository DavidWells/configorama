const REPLACE_PATTERN = /([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|<>\-\&])/g

/**
 * Replace all occurrences of a string while handling regex special characters
 * @param {string} replaceThis - String to replace
 * @param {string} withThis - Replacement string
 * @param {string} inThis - Source string
 * @returns {string} String with all replacements made
 */
function replaceAll(replaceThis, withThis, inThis) {
  withThis = withThis.replace(/\$/g, '$$$$')
  const pat = new RegExp(replaceThis.replace(REPLACE_PATTERN, '\\$&'), 'g')
  return inThis.replace(pat, withThis)
}

module.exports = { replaceAll } 