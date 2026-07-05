const { splitByComma } = require('./splitByComma')

// Regex to match ${...} variables (used for protection during file path splitting)
const VARIABLE_SYNTAX = /\${[^}]+}/g

/**
 * Split a string by delimiter while preserving quoted content and balanced parentheses
 * NOTE: This is a simpler version that delegates to splitByComma for consistency.
 * For advanced use cases with bracket depth tracking and regex protection, use splitByComma directly.
 * @param {string} str - String to split
 * @param {string} [splitter] - Optional custom splitter (defaults to ',')
 * @param {object} [options] - Options object
 * @param {boolean} [options.protectVariables] - If true, protect ${} variables from splitting
 * @returns {string[]} Array of split strings
 */
function splitCsv(str, splitter, options = {}) {
  // If custom splitter is provided, use implementation with parenthesis tracking
  if (splitter && splitter !== ',') {
    const result = []
    let current = ''
    let inQuote = false
    let quoteChar = ''
    let parenDepth = 0
    let bracketDepth = 0
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i]
      
      // Handle quotes
      if ((char === "'" || char === '"') && (i === 0 || str[i-1] !== '\\')) {
        if (!inQuote) {
          inQuote = true
          quoteChar = char
        } else if (char === quoteChar) {
          inQuote = false
        }
      }
      
      // Handle parentheses and brackets (only outside quotes)
      if (!inQuote) {
        if (char === '(') parenDepth++
        else if (char === ')') parenDepth--
        else if (char === '[') bracketDepth++
        else if (char === ']') bracketDepth--
      }
      
      // Check if we're at a splitter position
      const atSplitter = str.substring(i, i + splitter.length) === splitter
      
      if (atSplitter && !inQuote && parenDepth === 0 && bracketDepth === 0) {
        result.push(current.trim())
        current = ''
        i += splitter.length - 1 // Skip rest of splitter
      } else {
        current += char
      }
    }
    
    if (current.trim() || result.length > 0) {
      result.push(current.trim())
    }
    
    return result
  }

  // For standard comma splitting, use the more robust splitByComma
  // Pass VARIABLE_SYNTAX if protectVariables is true to protect ${} from splitting
  if (options.protectVariables) {
    return splitByComma(str, VARIABLE_SYNTAX)
  }
  return splitByComma(str)
}

module.exports = { splitCsv } 