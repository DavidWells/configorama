// Track accessed config keys across test files
let accessedKeys = new Set()

// Create tracking proxy
function createTrackingProxy(obj) {
  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'string' && prop !== 'toString') {
        accessedKeys.add(prop)
      }
      return target[prop]
    }
  })
}

// Check for unused config values
function checkUnusedConfigValues(config = {}) {
  const allKeys = new Set(Object.keys(config))
  const unusedKeys = new Set([...allKeys].filter(x => !accessedKeys.has(x)))
  
  if (unusedKeys.size > 0) {
    console.log('Untested config values:', [...unusedKeys])
  }
  // Reset accessed keys for next test run
  accessedKeys = new Set()
}

module.exports = {
  createTrackingProxy,
  checkUnusedConfigValues
} 