const path = require('path')
const fs = require('fs')

/**
 * Load TypeScript file and return its export (without executing)
 * @param {string} filePath - Full path to the TypeScript file
 * @param {Object} opts - Additional options (unused, kept for API compat)
 * @returns {Promise<*>} The exported module from the TypeScript file
 */
async function executeTypeScriptFile(filePath, opts = {}) {
  // Check if tsx is available first (preferred)
  let useTsx = false
  try {
    require.resolve('tsx/cjs/api')
    useTsx = true
  } catch (err) {
    // Fallback to ts-node if tsx is not available
    try {
      require.resolve('ts-node/register')
    } catch (tsNodeErr) {
      throw new Error(
        'TypeScript support requires either "tsx" or "ts-node" to be installed. ' +
        'Please install one of them:\n' +
        '  npm install tsx --save-dev (recommended)\n' +
        '  npm install ts-node typescript --save-dev'
      )
    }
  }

  // Clear require cache to ensure fresh execution
  const resolvedPath = require.resolve(filePath)
  delete require.cache[resolvedPath]

  let tsFile
  if (useTsx) {
    // Use tsx for modern, fast TypeScript execution
    // @ts-ignore - tsx doesn't have type declarations
    const { register } = require('tsx/cjs/api')
    const restore = register()
    try {
      tsFile = require(filePath)
    } catch (err) {
      throw new Error(`Failed to load TypeScript file: ${err.message}`)
    } finally {
      restore()
    }
  } else {
    // Fallback to ts-node
    try {
      // @ts-ignore - ts-node is optional peer dependency
      require('ts-node/register')
      tsFile = require(filePath)
    } catch (err) {
      throw new Error(`Failed to load TypeScript file with ts-node: ${err.message}`)
    }
  }

  // Handle ES module default exports
  if (tsFile && typeof tsFile === 'object' && 'default' in tsFile) {
    tsFile = tsFile.default
  }

  return tsFile
}

/**
 * Load TypeScript file synchronously and return its export
 * @param {string} filePath - Full path to the TypeScript file
 * @param {Object} opts - Additional options (unused, kept for API compat)
 * @returns {*} The exported module from the TypeScript file
 */
function executeTypeScriptFileSync(filePath, opts = {}) {
  // Check if tsx is available first (preferred)
  let useTsx = false
  try {
    require.resolve('tsx/cjs/api')
    useTsx = true
  } catch (err) {
    // Fallback to ts-node if tsx is not available
    try {
      require.resolve('ts-node/register')
    } catch (tsNodeErr) {
      throw new Error(
        'TypeScript support requires either "tsx" or "ts-node" to be installed. ' +
        'Please install one of them:\n' +
        '  npm install tsx --save-dev (recommended)\n' +
        '  npm install ts-node typescript --save-dev'
      )
    }
  }

  // Clear require cache to ensure fresh execution
  const resolvedPath = require.resolve(filePath)
  delete require.cache[resolvedPath]

  let tsFile
  if (useTsx) {
    // Use tsx for modern, fast TypeScript execution
    // @ts-ignore - tsx doesn't have type declarations
    const { register } = require('tsx/cjs/api')
    const restore = register()
    try {
      tsFile = require(filePath)
    } catch (err) {
      throw new Error(`Failed to load TypeScript file: ${err.message}`)
    } finally {
      restore()
    }
  } else {
    // Fallback to ts-node
    try {
      // @ts-ignore - ts-node is optional peer dependency
      require('ts-node/register')
      tsFile = require(filePath)
    } catch (err) {
      throw new Error(`Failed to load TypeScript file with ts-node: ${err.message}`)
    }
  }

  // Handle ES module default exports
  if (tsFile && typeof tsFile === 'object' && 'default' in tsFile) {
    tsFile = tsFile.default
  }

  return tsFile
}

module.exports = {
  executeTypeScriptFile,
  executeTypeScriptFileSync
}