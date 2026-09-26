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
 * Alternative implementation for finding outermost braces using depth tracking
 * Optimized for simple bracket matching without prefix
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character
 * @param {string} closeChar - The closing character
 * @returns {Array<string>} Array of matched substrings including delimiters
 */
function findOutermostBracesDepthFirst(text, openChar = '{', closeChar = '}') {
  const results = []
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
        results.push(text.substring(startIndex, i + 1))
        startIndex = -1
      }
    }
  }

  return results
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
 * @returns {string|null} The enclosing outermost variable, or null if not determinable
 */
function findEnclosingVariable(text, variable, prefix, suffix) {
  if (!prefix || !suffix || suffix.length !== 1) return null
  const outermost = findOutermostBraces(text, prefix.slice(-1), suffix, prefix.slice(0, -1))
  const enclosing = outermost.find((match) => match.indexOf(variable) > -1)
  return enclosing || null
}

module.exports = {
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findOutermostVariables,
  findEnclosingVariable
}
