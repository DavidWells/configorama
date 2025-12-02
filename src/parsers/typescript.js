const path = require('path')
const fs = require('fs')

/**
 * Execute TypeScript file and return its export
 * @param {string} filePath - Full path to the TypeScript file
 * @param {Object} opts - Additional options including dynamicArgs
 * @returns {Promise<*>} The result of executing the TypeScript file
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

  if (typeof tsFile !== 'function') {
    return tsFile
  } else {
    let tsArgs = opts.dynamicArgs || {}
    if (tsArgs && typeof tsArgs === 'function') {
      tsArgs = tsArgs()
    }
    
    try {
      const result = tsFile(tsArgs)
      
      // Handle promises
      if (result && typeof result.then === 'function') {
        return await result
      }
      
      return result
    } catch (err) {
      throw new Error(`Error executing TypeScript function: ${err.message}`)
    }
  }
}

/**
 * Synchronous TypeScript file execution (using tsx with sync API)
 * @param {string} filePath - Full path to the TypeScript file
 * @param {Object} opts - Additional options including dynamicArgs
 * @returns {*} The result of executing the TypeScript file
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

  if (typeof tsFile !== 'function') {
    return tsFile
  } else {
    let tsArgs = opts.dynamicArgs || {}
    if (tsArgs && typeof tsArgs === 'function') {
      tsArgs = tsArgs()
    }
    
    try {
      const result = tsFile(tsArgs)
      
      // Note: For sync execution, we don't await promises
      // If the function returns a promise, it will be resolved by the calling code
      return result
    } catch (err) {
      throw new Error(`Error executing TypeScript function: ${err.message}`)
    }
  }
}

module.exports = {
  executeTypeScriptFile,
  executeTypeScriptFileSync
}