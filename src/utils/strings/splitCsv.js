const { splitByComma } = require('./splitByComma')

// Regex to match ${...} variables (used for protection during file path splitting)
const VARIABLE_SYNTAX = /\${[^}]+}/g

/**
 * Split a string by comma while preserving quoted content
 * NOTE: This is a simpler version that delegates to splitByComma for consistency.
 * For advanced use cases with bracket depth tracking and regex protection, use splitByComma directly.
 * @param {string} str - String to split
 * @param {string} [splitter] - Optional custom splitter (defaults to ',')
 * @param {object} [options] - Options object
 * @param {boolean} [options.protectVariables] - If true, protect ${} variables from splitting
 * @returns {string[]} Array of split strings
 */
function splitCsv(str, splitter, options = {}) {
  // If custom splitter is provided, fall back to original simple implementation
  if (splitter && splitter !== ',') {
    const splitSyntax = splitter
    return str.split(splitSyntax).reduce(
      (acc, curr) => {
        if (acc.isConcatting) {
          acc.soFar[acc.soFar.length - 1] += splitter + curr
        } else {
          acc.soFar.push(curr)
        }
        if (curr.split('"').length % 2 == 0) {
          acc.isConcatting = !acc.isConcatting
        }
        return acc
      },
      {
        soFar: [],
        isConcatting: false,
      },
    ).soFar
  }

  // For standard comma splitting, use the more robust splitByComma
  // Pass VARIABLE_SYNTAX if protectVariables is true to protect ${} from splitting
  if (options.protectVariables) {
    return splitByComma(str, VARIABLE_SYNTAX)
  }
  return splitByComma(str)
}

module.exports = { splitCsv } 