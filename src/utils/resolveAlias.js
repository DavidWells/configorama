const path = require('path')
const fs = require('fs')
const findUp = require('find-up')

let aliasResolver = null

/**
 * Resolves path aliases using alias-hq library
 * @param {string} filePath - The potentially aliased file path
 * @param {string} configPath - The base directory to search for config files
 * @returns {string} - The resolved file path
 */
function resolveAlias(filePath, configPath) {
  // Only process paths that start with alias syntax (contain @)
  if (!filePath.includes('@')) {
    return filePath
  }

  try {
    // Lazy load alias-hq only when needed
    if (!aliasResolver) {
      const aliasHq = require('alias-hq')
      
      // Find the nearest tsconfig.json or jsconfig.json
      const tsConfigPath = findUp.sync(['tsconfig.json', 'jsconfig.json'], { cwd: configPath })
      
      if (tsConfigPath) {
        // Initialize alias resolver with the config file
        aliasResolver = aliasHq.get(path.dirname(tsConfigPath))
      } else {
        // No config file found, return original path
        return filePath
      }
    }

    // Resolve the alias
    const resolved = aliasResolver(filePath)
    
    // If alias resolution returned something different, use it
    if (resolved && resolved !== filePath) {
      return resolved
    }
    
    // Fall back to original path if no alias matched
    return filePath
    
  } catch (error) {
    // If alias resolution fails, fall back to original path
    console.warn(`Warning: Failed to resolve alias for "${filePath}":`, error.message)
    return filePath
  }
}

module.exports = resolveAlias