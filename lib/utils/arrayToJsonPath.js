/**
 * Convert array of paths to JSON path string
 */
function arrayToJsonPath(paths) {
  return paths.reduce((result, path, index) => {
    if (index === 0) return path.toString()
    return typeof path === 'string' ? `${result}.${path}` : `${result}[${path}]`
  }, '')
}

module.exports = { arrayToJsonPath } 