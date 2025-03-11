const util = require('util')

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

let DEBUG = process.argv.includes('--debug') ? true : false
// DEBUG = true
const logger = DEBUG ? deepLog : () => {}

function logValue(value, isFirst, isLast) {
  const prefix = `${isFirst ? '> ' : ''}`
  if (typeof value === 'object') {
    console.log(`${util.inspect(value, false, null, true)}\n`)
    return
  }
  if (isFirst) {
    console.log(`\n\x1b[33m${prefix}${value}\x1b[0m`)
    return
  }
  console.log((typeof value === 'string' && value.includes('\n')) ? `\`${value}\`` : value)
  // isLast && console.log(`\x1b[37m\x1b[1m${'─'.repeat(94)}\x1b[0m\n`)
}

function deepLog() {
  for (let i = 0; i < arguments.length; i++) logValue(arguments[i], i === 0, i === arguments.length - 1)
}

module.exports = {
  createTrackingProxy,
  checkUnusedConfigValues,
  logger,
  deepLog
} 