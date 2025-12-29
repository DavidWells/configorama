const REPLACE_PATTERN = /([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|<>\-\&])/g

// Cache for compiled regex patterns (perf: avoid recompilation)
const regexCache = new Map()

/**
 * Replace all occurrences of a string while handling regex special characters
 * @param {string} replaceThis - String to replace
 * @param {string} withThis - Replacement string
 * @param {string} inThis - Source string
 * @returns {string} String with all replacements made
 */
function replaceAll(replaceThis, withThis, inThis) {
  withThis = withThis.replace(/\$/g, '$$$$')

  // Check cache first
  let pat = regexCache.get(replaceThis)
  if (!pat) {
    pat = new RegExp(replaceThis.replace(REPLACE_PATTERN, '\\$&'), 'g')
    regexCache.set(replaceThis, pat)
  }

  // Reset lastIndex for global regex reuse
  pat.lastIndex = 0
  return inThis.replace(pat, withThis)
}

module.exports = { replaceAll } 