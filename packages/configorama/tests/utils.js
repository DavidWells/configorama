const fs = require('fs')
const os = require('os')
const path = require('path')
const util = require('util')

// Test detail output is opt-in: with TEST_VERBOSE=1 test files print what they log
const TEST_VERBOSE = !!process.env.TEST_VERBOSE

/**
 * Print only when TEST_VERBOSE is set
 * @param {(...args: any[]) => void} write - console method to print with
 * @returns {(...args: any[]) => void} Gated method
 */
function whenVerbose(write) {
  return (...args) => { if (TEST_VERBOSE) write(...args) }
}

/**
 * console for test files: log/info/dir/table print only with TEST_VERBOSE=1, so a normal
 * run shows just results; warn/error always print
 */
const quietConsole = Object.assign(Object.create(console), {
  log: whenVerbose(console.log.bind(console)),
  info: whenVerbose(console.info.bind(console)),
  dir: whenVerbose(console.dir.bind(console)),
  table: whenVerbose(console.table.bind(console)),
})

// Track accessed config keys across test files
let accessedKeys = new Set()

// Create tracking proxy (shallow - tracks top-level keys only)
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
    quietConsole.log('\n\x1b[31mNotice: Untested config values:\x1b[0m\n', [...unusedKeys])
  }
  // Reset accessed keys for next test run
  accessedKeys = new Set()
}

// Deep tracking proxy - tracks all nested paths
let deepAccessedPaths = new Set()

function createDeepTrackingProxy(obj, path = '') {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'string' && prop !== 'toString' && prop !== 'toJSON' && prop !== Symbol.toStringTag) {
        const currentPath = path ? `${path}.${prop}` : prop
        deepAccessedPaths.add(currentPath)

        const value = target[prop]
        // Recursively wrap objects/arrays
        if (value !== null && typeof value === 'object') {
          return createDeepTrackingProxy(value, currentPath)
        }
        return value
      }
      return target[prop]
    }
  })
}

// Get all leaf paths from an object
function getAllPaths(obj, prefix = '') {
  const paths = []
  for (const key of Object.keys(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...getAllPaths(value, currentPath))
    } else {
      paths.push(currentPath)
    }
  }
  return paths
}

// Check for unused deep config values
function checkUnusedDeepConfigValues(config = {}) {
  const allPaths = new Set(getAllPaths(config))
  const unusedPaths = [...allPaths].filter(p => !deepAccessedPaths.has(p))

  if (unusedPaths.length > 0) {
    quietConsole.log('\n\x1b[31mNotice: Untested config paths:\x1b[0m')
    unusedPaths.forEach(p => quietConsole.log(`  - ${p}`))
  }
  // Reset for next test run
  deepAccessedPaths = new Set()
}

let DEBUG = process.argv.includes('--debug') ? true : false
// DEBUG = true
const logger = DEBUG ? deepLog : () => {}

function logValue(value, isFirst, isLast) {
  const prefix = `${isFirst ? '> ' : ''}`
  if (typeof value === 'object') {
    quietConsole.log(`${util.inspect(value, false, null, true)}\n`)
    return
  }
  if (isFirst) {
    quietConsole.log(`\n\x1b[33m${prefix}${value}\x1b[0m`)
    return
  }
  quietConsole.log((typeof value === 'string' && value.includes('\n')) ? `\`${value}\`` : value)
  // isLast && console.log(`\x1b[37m\x1b[1m${'─'.repeat(94)}\x1b[0m\n`)
}

function deepLog() {
  for (let i = 0; i < arguments.length; i++) logValue(arguments[i], i === 0, i === arguments.length - 1)
}

/** @type {string|undefined} */
let yamlTextDir

/**
 * Resolve YAML text from its own temp file with the async and sync APIs, asserting
 * both agree (or both throw). A file per call keeps cases isolated from each other.
 * Sync results travel as JSON, so settings with functions (custom variableSources) and
 * keys resolving to undefined can't use this helper.
 * @param {string} yml - YAML file contents
 * @param {object} [settings] - configorama settings (options defaults to {})
 * @returns {Promise<Record<string, any>>} The resolved config
 */
async function resolveYamlText(yml, settings = {}) {
  const configorama = require('../src')
  const assert = require('uvu/assert')
  if (!yamlTextDir) {
    yamlTextDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-yaml-'))
    process.on('exit', () => fs.rmSync(yamlTextDir, { recursive: true, force: true }))
  }
  const file = path.join(yamlTextDir, `case-${fs.readdirSync(yamlTextDir).length}.yml`)
  fs.writeFileSync(file, yml)
  const opts = Object.assign({ configDir: yamlTextDir, options: {} }, settings)
  let config
  try {
    config = await configorama(file, opts)
  } catch (err) {
    // The sync API must fail on the same input with the same message
    assert.throws(() => configorama.sync(file, opts), (syncErr) => syncErr.message.includes(err.message.split('\n')[0]))
    throw err
  }
  const syncConfig = configorama.sync(file, opts)
  assert.equal(syncConfig, config, 'sync and async results differ')
  return config
}

module.exports = {
  quietConsole,
  resolveYamlText,
  createTrackingProxy,
  checkUnusedConfigValues,
  createDeepTrackingProxy,
  checkUnusedDeepConfigValues,
  logger,
  deepLog
} 