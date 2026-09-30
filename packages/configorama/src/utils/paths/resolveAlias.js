const path = require('path')
const fs = require('fs')

const DEBUG = false
const DEBUG_LOG = (message) => {
  if (DEBUG) {
    DEBUG_LOG(message)
  }
}

/**
 * Match find-up 3's synchronous search without throwing/catching an access
 * error for every missing file. Its stopAt option was ignored, so the search
 * still includes every ancestor up to the filesystem root.
 * @param {string} filename
 * @param {string} configDir
 * @returns {string|null}
 */
function findAncestorConfig(filename, configDir) {
  let dir = path.resolve(configDir)
  while (true) {
    const candidate = path.join(dir, filename)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Finds the nearest config file (tsconfig.json or jsconfig.json) in the directory tree
 * @param {string} configDir - The directory to start searching from
 * @returns {string|null} - Path to the config file or null if not found
 */
function findConfigFile(configDir) {
  // Try tsconfig.json first
  const tsconfigPath = findAncestorConfig('tsconfig.json', configDir)
  if (tsconfigPath) {
    return tsconfigPath
  }

  // Fall back to jsconfig.json
  const jsconfigPath = findAncestorConfig('jsconfig.json', configDir)
  if (jsconfigPath) {
    return jsconfigPath
  }

  return null
}

/**
 * Resolves path aliases using TypeScript/JavaScript path mappings from config files
 * @param {string} filePath - The potentially aliased file path
 * @param {string} configDir - The base directory to search for config files
 * @returns {string} - The resolved file path
 */
function resolveAlias(filePath, configDir) {
  try {
    // Find and load config file
    const configPath = findConfigFile(configDir)
    if (!configPath) {
      // console.warn(
      //   `Warning: No tsconfig.json or jsconfig.json found in directory tree starting from ${configDir}`
      // )
      return filePath
    }

    // Read and parse config file
    const config = require('../../parsers/json5').parse(fs.readFileSync(configPath, 'utf8'))
    const { paths = {}, baseUrl = '.' } = config.compilerOptions || {}

    // Extract the alias prefix and path
    // Match any non-slash characters at the start of the path
    const match = filePath.match(/^([^/]+)(\/.*)?$/)
    if (!match) {
      return filePath
    }

    const [, aliasPrefix, restPath = ''] = match

    // Try exact match first (e.g. settings)
    const exactKey = aliasPrefix
    if (paths[exactKey]) {
      const mappedPath = paths[exactKey][0]
      const resolvedPath = path.resolve(path.dirname(configPath), baseUrl, mappedPath)
      DEBUG_LOG(`Resolving exact alias ${filePath} to ${resolvedPath}`)
      return resolvedPath
    }

    // Try wildcard match (e.g. alias/*)
    const wildcardKey = `${aliasPrefix}/*`
    if (paths[wildcardKey]) {
      const mappedPath = paths[wildcardKey][0]
      const basePath = path.resolve(path.dirname(configPath), baseUrl, mappedPath.replace('*', ''))
      const relativeRest = restPath.replace(/^\//, '')
      const resolvedPath = path.join(basePath, relativeRest)
      DEBUG_LOG(`Resolving wildcard alias ${filePath} to ${resolvedPath}`)
      return resolvedPath
    }

    // Try nested alias resolution
    const nestedMatch = filePath.match(/^([^/]+\/[^/]+)(\/.*)?$/)
    if (nestedMatch) {
      const [, nestedPrefix, nestedRest = ''] = nestedMatch
      const nestedKey = `${nestedPrefix}/*`
      if (paths[nestedKey]) {
        const mappedPath = paths[nestedKey][0]
        const basePath = path.resolve(path.dirname(configPath), baseUrl, mappedPath.replace('*', ''))
        const relativeRest = nestedRest.replace(/^\//, '')
        const resolvedPath = path.join(basePath, relativeRest)
        DEBUG_LOG(`Resolving nested alias ${filePath} to ${resolvedPath}`)
        return resolvedPath
      }
    }

    // Fall back to original path if no alias matched
    // console.warn(`Warning: No alias mapping found for ${filePath}`)
    return filePath

  } catch (error) {
    // If alias resolution fails, fall back to original path
    console.warn(`Warning: Failed to resolve alias for "${filePath}":`, error.message)
    return filePath
  }
}

/**
 * Gets all configured aliases from tsconfig.json or jsconfig.json
 * @param {string} configDir - The base directory to search for config files
 * @returns {Object} - Object containing alias names and their resolved paths
 */
function getAliases(configDir) {
  try {
    const configPath = findConfigFile(configDir)
    if (!configPath) {
      // console.warn(`Warning: No tsconfig.json or jsconfig.json found in directory tree starting from ${configDir}`)
      return { names: [], lookup: [] }
    }

    const config = require('../../parsers/json5').parse(fs.readFileSync(configPath, 'utf8'))
    const { paths = {}, baseUrl = '.' } = config.compilerOptions || {}

    const names = Object.keys(paths).map(key => key.replace('/*', ''))
    const lookup = Object.entries(paths).map(([key, [value]]) => {
      const name = key.replace('/*', '')
      const absPath = path.resolve(path.dirname(configPath), baseUrl, value.replace('/*', ''))
      const relPath = path.relative(configDir, absPath)
      return { name, absPath, relPath }
    })

    return { names, lookup }
  } catch (error) {
    console.warn(`Warning: Failed to get aliases:`, error.message)
    return { names: [], lookup: [] }
  }
}

module.exports = {
  resolveAlias,
  getAliases
}
