// Turns bracket access in a variable path (items[1], objs[0]['n']) into the dot
// notation the path lookups use (items.1, objs.0.n)

/**
 * Convert bracket index/key access to dot notation
 * @param {string} keyPath - Path like items[1] or objs[0]['n']
 * @returns {string} Dot path like items.1 or objs.0.n
 */
function bracketsToDots(keyPath) {
  if (typeof keyPath !== 'string' || keyPath.indexOf('[') === -1) return keyPath
  return keyPath.replace(/\[\s*(?:'([^']*)'|"([^"]*)"|(\d+))\s*\]/g, (_, single, double, index) => {
    const key = single !== undefined ? single : double !== undefined ? double : index
    return `.${key}`
  }).replace(/^\./, '')
}

module.exports = { bracketsToDots }
