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
    // TOML/HCL: key = or key=
    if (fileType === '.toml' || fileType === '.hcl') {
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

/**
 * Walk a dot-separated config path through raw file lines to find the exact line.
 * YAML uses indentation-based nesting, JSON uses brace-based nesting.
 * @param {string} configPath - Dot-separated path (e.g. 'resources.Parameters.Description')
 * @param {string[]} lines - Array of file lines
 * @param {string} fileType - File extension (e.g., '.yml', '.json')
 * @returns {number} Line number (1-indexed) or 0 if not found
 */
function findLineByPath(configPath, lines, fileType) {
  if (!configPath || !lines || !lines.length) return 0

  const isYaml = fileType === '.yml' || fileType === '.yaml'
  const isJson = fileType === '.json' || fileType === '.json5' || fileType === '.jsonc'
  if (!isYaml && !isJson) return 0

  const segments = configPath.split('.')
  if (isYaml) return findLineByPathYaml(segments, lines)
  return findLineByPathJson(segments, lines)
}

/**
 * @param {string[]} segments
 * @param {string[]} lines
 * @returns {number}
 */
function findLineByPathYaml(segments, lines) {
  let searchStart = 0
  let parentIndent = -1

  for (let si = 0; si < segments.length; si++) {
    const key = segments[si]
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const keyPattern = new RegExp(`^(\\s*)${escaped}\\s*:`)
    let found = false

    for (let li = searchStart; li < lines.length; li++) {
      const match = keyPattern.exec(lines[li])
      if (!match) continue

      const indent = match[1].length
      // Must be exactly one level deeper than parent (or top-level if parentIndent is -1)
      if (parentIndent === -1 && indent === 0) {
        // Top-level key
      } else if (indent <= parentIndent) {
        // We've left the parent's scope — key not found under this parent
        break
      } else if (indent <= parentIndent) {
        continue
      }

      // Found the key at this nesting level
      if (si === segments.length - 1) {
        return li + 1
      }
      // Descend: next segment must be indented deeper, starting after this line
      parentIndent = indent
      searchStart = li + 1
      found = true
      break
    }

    if (!found) return 0
  }
  return 0
}

/**
 * @param {string[]} segments
 * @param {string[]} lines
 * @returns {number}
 */
function findLineByPathJson(segments, lines) {
  let searchStart = 0
  let targetDepth = 1 // JSON top-level keys are at brace depth 1

  for (let si = 0; si < segments.length; si++) {
    const key = segments[si]
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const keyPattern = new RegExp(`"${escaped}"\\s*:`)
    let depth = 0
    let found = false

    for (let li = searchStart; li < lines.length; li++) {
      const line = lines[li]
      // Track brace depth character by character
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci]
        if (ch === '{') depth++
        else if (ch === '}') depth--
      }

      // Check for key match at the right depth
      // We need to check depth BEFORE the line's closing braces
      let depthBeforeLine = depth
      for (let ci = 0; ci < line.length; ci++) {
        if (line[ci] === '{') depthBeforeLine--
        else if (line[ci] === '}') depthBeforeLine++
      }

      if (keyPattern.test(line)) {
        // Calculate depth at the point where the key appears
        let depthAtKey = 0
        for (let cli = 0; cli < li; cli++) {
          for (let ci = 0; ci < lines[cli].length; ci++) {
            if (lines[cli][ci] === '{') depthAtKey++
            else if (lines[cli][ci] === '}') depthAtKey--
          }
        }
        // Account for any opening braces before the key on this line
        const keyIdx = line.search(keyPattern)
        for (let ci = 0; ci < keyIdx; ci++) {
          if (line[ci] === '{') depthAtKey++
          else if (line[ci] === '}') depthAtKey--
        }

        if (depthAtKey === targetDepth) {
          if (si === segments.length - 1) {
            return li + 1
          }
          targetDepth++
          searchStart = li + 1
          found = true
          break
        }
      }
    }

    if (!found) return 0
  }
  return 0
}

module.exports = {
  findLineForKey,
  findLineByPath
}
