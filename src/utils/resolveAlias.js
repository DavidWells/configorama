const path = require('path')
const fs = require('fs')
const findUp = require('find-up')

let aliasMappings = null

/**
 * Resolves path aliases using TypeScript path mappings from tsconfig.json
 * @param {string} filePath - The potentially aliased file path
 * @param {string} configDir - The base directory to search for config files
 * @returns {string} - The resolved file path
 */
function resolveAlias(filePath, configDir) {
  console.log('resolveAlias', filePath, configDir)
  console.log('aliasMappings', aliasMappings)
  // Only process paths that start with alias syntax (contain @)
  if (!filePath.includes('@')) {
    return filePath
  }

  try {
    // Lazy load alias mappings only when needed
    if (!aliasMappings) {
      // Find tsconfig.json in the config directory
      const tsconfigPath = findUp.sync('tsconfig.json', { cwd: configDir })
      if (!tsconfigPath) {
        throw new Error('No tsconfig.json found in directory tree')
      }

      // Read and parse tsconfig.json
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
      const { paths, baseUrl } = tsconfig.compilerOptions || {}

      if (!paths || !baseUrl) {
        throw new Error('No paths or baseUrl found in tsconfig.json')
      }

      // Convert TypeScript path mappings to our format
      aliasMappings = {}
      for (const [alias, [mapping]] of Object.entries(paths)) {
        // Remove the /* from the alias and mapping
        const cleanAlias = alias.replace('/*', '')
        const cleanMapping = mapping.replace('/*', '')
        aliasMappings[cleanAlias] = path.resolve(path.dirname(tsconfigPath), baseUrl, cleanMapping)
      }
      
      // Log successful initialization
      console.log(`Initialized alias mappings with config from: ${tsconfigPath}`)
      console.log('Alias mappings:', aliasMappings)
    }

    // Extract the alias prefix and path
    const match = filePath.match(/^(@[^/]+)(\/.*)$/)
    if (!match) {
      return filePath
    }

    const [, aliasPrefix, restPath] = match
    // Use aliasPrefix directly as key (e.g. '@alias')
    const aliasKey = aliasPrefix

    // Check if we have a mapping for this alias
    if (aliasMappings && aliasMappings[aliasKey]) {
      // Join the mapped directory with the rest of the path (removing leading slash)
      const mappedDir = aliasMappings[aliasKey]
      const relativeRest = restPath.replace(/^\//, '')
      const resolvedPath = path.join(mappedDir, relativeRest)
      
      // Log the resolution for debugging
      console.log(`Resolving ${filePath} to ${resolvedPath}`)
      
      return resolvedPath
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