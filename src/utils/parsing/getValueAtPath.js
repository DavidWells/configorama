/* Extract value from object/array using jq-style path syntax */

/**
 * Parse a jq-style path string into an array of keys/indices
 * @param {string} path - jq-style path like '.foo.bar[0]' or '.["key"]'
 * @returns {string[]} Array of path segments
 */
function parsePath(path) {
  if (!path || typeof path !== 'string') return []

  path = path.trim()

  // Handle identity or empty
  if (path === '.' || path === '') return []

  // Remove leading dot if present
  if (path.startsWith('.')) {
    path = path.slice(1)
  }

  const segments = []
  let i = 0

  while (i < path.length) {
    // Skip leading dots (from chained access like .foo.bar)
    if (path[i] === '.') {
      i++
      continue
    }

    // Bracket notation: [0], [-1], ["key"], ['key']
    if (path[i] === '[') {
      const closeIdx = path.indexOf(']', i)
      if (closeIdx === -1) {
        throw new Error(`Unclosed bracket in path: ${path}`)
      }

      let content = path.slice(i + 1, closeIdx)

      // Check if it's a quoted string key
      if ((content.startsWith('"') && content.endsWith('"')) ||
          (content.startsWith("'") && content.endsWith("'"))) {
        segments.push(content.slice(1, -1))
      } else {
        // It's a number index
        const num = Number(content)
        if (!Number.isInteger(num)) {
          throw new Error(`Invalid array index: ${content}`)
        }
        segments.push(num)
      }

      i = closeIdx + 1
      continue
    }

    // Regular identifier: read until . or [ or end
    let end = i
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      end++
    }

    if (end > i) {
      segments.push(path.slice(i, end))
    }

    i = end
  }

  return segments
}

/**
 * Get value from object/array at jq-style path
 * @param {*} data - Object or array to extract from
 * @param {string} path - jq-style path like '.foo.bar[0]'
 * @returns {*} Value at path or undefined if not found
 */
function getValueAtPath(data, path) {
  if (data === null || data === undefined) {
    return undefined
  }

  const segments = parsePath(path)

  // Identity path returns input
  if (segments.length === 0) {
    return data
  }

  let current = data

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined
    }

    // Handle negative array indices
    if (typeof segment === 'number' && segment < 0 && Array.isArray(current)) {
      const idx = current.length + segment
      current = current[idx]
    } else {
      current = current[segment]
    }
  }

  return current
}

module.exports = getValueAtPath
module.exports.parsePath = parsePath
