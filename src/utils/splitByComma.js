const stringResolver = require('../resolvers/valueFromString')
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
  let current = ""
  let inQuote = false
  let quoteChar = ""
  let bracketDepth = 0  // Includes (), [], and {}
  let dollarBraceDepth = 0  // Track ${ ... } depth separately (only when regexPattern is provided)

  for (let i = 0; i < protectedString.length; i++) {
    const char = protectedString[i]
    const prevChar = i > 0 ? protectedString[i-1] : ''

    // Handle quotes
    if ((char === "'" || char === '"') && (i === 0 || protectedString[i-1] !== "\\")) {
      if (!inQuote) {
        inQuote = true
        quoteChar = char
      } else if (char === quoteChar) {
        inQuote = false
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

    // Process comma
    if (char === "," && !inQuote && bracketDepth === 0 && dollarBraceDepth === 0) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  
  if (current.trim() || result.length > 0) {
    result.push(current.trim())
  }

  if (!regexPattern) {
    return result
  }
  
  // Restore placeholders in the result
  return result.map(item => {
    return item.replace(/__PLACEHOLDER_(\d+)__/g, (match, index) => {
      return placeholders[parseInt(index)]
    })
  })
}

module.exports = {
  splitByComma
}
