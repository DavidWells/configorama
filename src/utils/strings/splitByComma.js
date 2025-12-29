const stringResolver = require('../../resolvers/valueFromString')
const overwriteSyntax = RegExp(/\s*(?:,\s*)+/g) // /\s*(?:,\s*)+/g
const stringRefSyntax = stringResolver.match
/**
 * Split a given string by whitespace padded commas excluding those within single or double quoted
 * strings.
 * @param string The string to split by comma.

 var string = "env:BAZ,'defaultEnvValue'"
 splitByComma(string)
 => ["env:BAZ", "'defaultEnvValue'"]
 */

// https://regex101.com/r/4uPmpt/1
const commasOutsideOfParens = /(?!<(?:\(|\[)[^)\]]+),(?![^(\[]+(?:\)|\]))/
const PLACEHOLDER_REGEX = /__PLACEHOLDER_(\d+)__/g
// const commasOutOfParens = /(?!(?:\()[^)\]]+),(?![^(\[]+(?:\)))/g
function splitByComma(string, regexPattern) {
  // Handle empty or undefined input
  if (!string || string.trim() === "") {
    return [""]
  }

  // Extract regex patterns to protect them
  const placeholders = []
  let protectedString = string
  if (regexPattern) {
    protectedString = string.replace(regexPattern, (match) => {
      placeholders.push(match)
      return `__PLACEHOLDER_${placeholders.length - 1}__`
    })
  }

  const result = []
  let segmentStart = 0  // Track segment start index (perf: avoid string concat)
  let inQuote = false
  let quoteChar = ""
  let bracketDepth = 0  // Includes (), [], and {}
  let dollarBraceDepth = 0  // Track ${ ... } depth separately (only when regexPattern is provided)

  for (let i = 0; i < protectedString.length; i++) {
    const char = protectedString[i]
    const prevChar = i > 0 ? protectedString[i-1] : ''

    // Handle quotes
    if (char === "'" || char === '"') {
      // Count consecutive backslashes before this quote
      let backslashCount = 0
      for (let j = i - 1; j >= 0 && protectedString[j] === "\\"; j--) {
        backslashCount++
      }
      // Quote is escaped only if preceded by odd number of backslashes
      const isEscaped = backslashCount % 2 === 1

      if (!isEscaped) {
        if (!inQuote) {
          inQuote = true
          quoteChar = char
        } else if (char === quoteChar) {
          inQuote = false
        }
      }
    }

    // Handle parentheses, brackets, and curly braces
    if (!inQuote) {
      if (char === "(" || char === "[") {
        bracketDepth++
      } else if (char === ")" || char === "]") {
        bracketDepth--
      } else if (regexPattern) {
        // Only track {} when we have regexPattern (i.e., when protecting variables)
        // TODO this doesn't support custom variable syntax regexes.
        if (char === "{" && prevChar === "$") {
          // Track ${ as a special unit
          dollarBraceDepth++
        } else if (char === "{") {
          // Standalone { (not part of ${)
          bracketDepth++
        } else if (char === "}") {
          // Check if this closes a ${ or a standalone {
          if (dollarBraceDepth > 0) {
            dollarBraceDepth--
          } else if (bracketDepth > 0) {
            bracketDepth--
          }
        }
      }
    }

    // Process comma - use substring instead of char-by-char concat
    if (char === "," && !inQuote && bracketDepth === 0 && dollarBraceDepth === 0) {
      result.push(protectedString.substring(segmentStart, i).trim())
      segmentStart = i + 1
    }
  }

  // Add final segment
  const finalSegment = protectedString.substring(segmentStart).trim()
  if (finalSegment || result.length > 0) {
    result.push(finalSegment)
  }

  if (!regexPattern) {
    return result
  }
  
  // Restore placeholders in the result
  return result.map(item => {
    return item.replace(PLACEHOLDER_REGEX, (match, index) => {
      return placeholders[parseInt(index)]
    })
  })
}

module.exports = {
  splitByComma
}
