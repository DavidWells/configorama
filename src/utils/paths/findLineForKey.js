/**
 * Finds the line number for a given key in config file contents
 */

/**
 * Find the line number where a key is defined in config file contents
 * @param {string} keyToFind - The key to search for
 * @param {string[]} lines - Array of file lines
 * @param {string} fileType - File extension (e.g., '.yml', '.json', '.toml')
 * @returns {number} Line number (1-indexed) or 0 if not found
 */
function findLineForKey(keyToFind, lines, fileType) {
  if (!keyToFind || !lines || !lines.length) return 0

  const escapedKey = keyToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const lineIdx = lines.findIndex((line) => {
    // YAML: key: or key :
    if (fileType === '.yml' || fileType === '.yaml') {
      return new RegExp(`^\\s*${escapedKey}\\s*:`).test(line)
    }
    // TOML: key = or key=
    if (fileType === '.toml') {
      return new RegExp(`^\\s*${escapedKey}\\s*=`).test(line)
    }
    // JSON: "key": or "key" :
    if (fileType === '.json' || fileType === '.json5') {
      return new RegExp(`"${escapedKey}"\\s*:`).test(line)
    }
    // INI: key = or key=
    if (fileType === '.ini') {
      return new RegExp(`^\\s*${escapedKey}\\s*=`).test(line)
    }
    // JS/TS/ESM: key: or "key": or 'key': or `key`: or [`key`]:
    if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(fileType)) {
      return new RegExp(`(?:${escapedKey}|"${escapedKey}"|'${escapedKey}'|\`${escapedKey}\`|\\[\`${escapedKey}\`\\])\\s*:`).test(line)
    }
    // Default fallback: try YAML-style
    return line.includes(`${keyToFind}:`)
  })

  return lineIdx !== -1 ? lineIdx + 1 : 0
}

module.exports = {
  findLineForKey
}
