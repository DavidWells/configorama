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
    (accum, curr) => {
      if (accum.isConcatting) {
        accum.soFar[accum.soFar.length - 1] += ',' + curr
      } else {
        accum.soFar.push(curr)
      }
      if (curr.split('"').length % 2 == 0) {
        accum.isConcatting = !accum.isConcatting
      }
      return accum
    },
    {
      soFar: [],
      isConcatting: false,
    },
  ).soFar
}

module.exports = { splitCsv } 