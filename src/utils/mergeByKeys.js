/**
 * Merge objects by specified keys
 */
function mergeByKeys(data, path, keysToMerge) {
  if (!data) return {}
  
  const items = path.split('.').reduce((obj, key) => obj?.[key], data)
  if (!Array.isArray(items)) return {}
  
  const result = {}
  const mergeAll = !keysToMerge || !Array.isArray(keysToMerge) || keysToMerge.length === 0
  
  for (const item of items) {
    const key = Object.keys(item)[0]
    
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
  return result
}

module.exports = { mergeByKeys } 