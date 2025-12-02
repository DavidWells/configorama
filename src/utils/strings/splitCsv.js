const { splitByComma } = require('./splitByComma')

/**
 * Split a string by comma while preserving quoted content
 * NOTE: This is a simpler version that delegates to splitByComma for consistency.
 * For advanced use cases with bracket depth tracking and regex protection, use splitByComma directly.
 * @param {string} str - String to split
 * @param {string} [splitter] - Optional custom splitter (defaults to ',')
 * @returns {string[]} Array of split strings
 */
function splitCsv(str, splitter) {
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
  return splitByComma(str)
}

module.exports = { splitCsv } 