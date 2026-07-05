/**
 * Merge objects by specified keys
 */
function mergeByKeys(data, path, keysToMerge) {
  if (!data) return {}

  // Handle empty path - operate on root data
  const items = path ? path.split('.').reduce((obj, key) => obj?.[key], data) : data
  if (!Array.isArray(items)) return data
  
  const result = {}
  const mergeAll = !keysToMerge || !Array.isArray(keysToMerge) || keysToMerge.length === 0
  
  for (const item of items) {
    const keys = Object.keys(item)
    for (const key of keys) {
      if (mergeAll || keysToMerge.includes(key)) {
        if (!result[key]) {
          result[key] = Object.assign({}, item[key])
        } else {
          result[key] = Object.assign({}, result[key], item[key])
        }
      } else {
        result[key] = item[key]
      }
    }
  }
  return result
}

module.exports = { mergeByKeys } 