const path = require('path')

/**
 * Execute ESM file and return its export using jiti
 * @param {string} filePath - Full path to the ESM file
 * @param {Object} opts - Additional options including dynamicArgs
 * @returns {Promise<*>} The result of executing the ESM file
 */
async function executeESMFile(filePath, opts = {}) {
  try {
    // Use require for now since ESM dynamic import in async context is complex
    // We'll use jiti to handle ESM syntax
    const { createJiti } = require('jiti')
    const jiti = createJiti(__filename, {
      interopDefault: true
    })

    // Load the ESM file - resolve to absolute path first
    const resolvedPath = path.resolve(filePath)
    let esmModule = jiti(resolvedPath)

    return esmModule
  } catch (err) {
    throw new Error(`Failed to load ESM file ${filePath}: ${err.message}`)
  }
}

/**
 * Synchronous ESM file execution using jiti
 * @param {string} filePath - Full path to the ESM file
 * @param {Object} opts - Additional options including dynamicArgs
 * @returns {*} The result of executing the ESM file
 */
function executeESMFileSync(filePath, opts = {}) {
  try {
    // Use jiti to handle ESM syntax synchronously
    const { createJiti } = require('jiti')
    const jiti = createJiti(__filename, {
      interopDefault: true
    })

    // Load the ESM file - resolve to absolute path first
    const resolvedPath = path.resolve(filePath)
    let esmModule = jiti(resolvedPath)

    return esmModule
  } catch (err) {
    throw new Error(`Failed to load ESM file ${filePath}: ${err.message}`)
  }
}

module.exports = {
  executeESMFile,
  executeESMFileSync
}