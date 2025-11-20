/**
 * Split a string by comma while preserving quoted content
 * @param {string} str - String to split
 * @param {string} splitter - Optional custom splitter (defaults to ',')
 * @returns {string[]} Array of split strings
 */
function splitCsv(str, splitter) {
  const splitSyntax = splitter || ','
  // Split at comma SPACE ", "
  return str.split(splitSyntax).reduce(
    (acc, curr) => {
      if (acc.isConcatting) {
        acc.soFar[acc.soFar.length - 1] += ',' + curr
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

module.exports = { splitCsv } 