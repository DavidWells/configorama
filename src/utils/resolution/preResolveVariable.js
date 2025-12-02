/**
 * Pre-resolve variables that don't have dynamic dependencies.
 * Uses existing resolvers to avoid duplicating logic.
 */
const fs = require('fs')
const path = require('path')
const dotProp = require('dot-prop')

const createGitResolver = require('../../resolvers/valueFromGit')
const { parseFileContents } = require('../../resolvers/valueFromFile')

// Cache for resolved values (they don't change during execution)
const resolverCache = {}

/**
 * Check if a string contains unresolved variable syntax
 * @param {string} str - String to check
 * @param {RegExp} variableSyntax - Variable syntax regex
 * @returns {boolean}
 */
function hasUnresolvedVars(str, variableSyntax) {
  if (typeof str !== 'string') return false
  if (!variableSyntax) {
    // Fallback to basic pattern if no syntax provided
    return /\$\{[^}]+\}/.test(str)
  }
  // Create a new regex from the source to avoid stateful lastIndex issues
  const regex = new RegExp(variableSyntax.source, variableSyntax.flags.replace('g', ''))
  return regex.test(str)
}

/**
 * Pre-resolve a single variable reference
 * @param {string} varString - Variable string like "self:path.to.value" or "env:VAR_NAME"
 * @param {object} context - Resolution context
 * @param {object} context.config - Original config object
 * @param {string} context.configDir - Config file directory
 * @param {RegExp} context.variableSyntax - Variable syntax regex
 * @returns {Promise<*>} Resolved value or undefined if can't pre-resolve
 */
async function preResolveSingle(varString, context) {
  const { config = {}, configDir, variableSyntax } = context

  // self: reference
  if (varString.startsWith('self:')) {
    const path = varString.slice(5).trim()
    if (hasUnresolvedVars(path, variableSyntax)) return undefined
    const value = dotProp.get(config, path)
    // Only return if the value itself doesn't contain variables
    if (value !== undefined && !hasUnresolvedVars(JSON.stringify(value), variableSyntax)) {
      return value
    }
    return undefined
  }

  // env: reference
  if (varString.startsWith('env:')) {
    const envVar = varString.slice(4).trim()
    if (hasUnresolvedVars(envVar, variableSyntax)) return undefined
    return process.env[envVar]
  }

  // git: reference - use existing resolver
  if (varString.startsWith('git:')) {
    const gitVar = varString.slice(4).trim()
    if (hasUnresolvedVars(gitVar, variableSyntax)) return undefined

    const cacheKey = `git:${configDir || '.'}:${gitVar}`
    if (resolverCache[cacheKey] !== undefined) {
      return resolverCache[cacheKey]
    }

    try {
      const gitResolver = createGitResolver(configDir)
      const value = await gitResolver.resolver(`git:${gitVar}`)
      resolverCache[cacheKey] = value
      return value
    } catch (e) {
      resolverCache[cacheKey] = undefined
      return undefined
    }
  }

  // opt: reference - CLI options
  if (varString.startsWith('opt:')) {
    const optName = varString.slice(4).trim()
    if (hasUnresolvedVars(optName, variableSyntax)) return undefined
    const { options = {} } = context
    return options[optName]
  }

  // file() reference - read file contents
  const fileMatch = varString.match(/^file\((.+?)\)(?::(.+))?$/)
  if (fileMatch) {
    const filePath = fileMatch[1].trim()
    const subPath = fileMatch[2] ? fileMatch[2].trim() : null

    if (hasUnresolvedVars(filePath, variableSyntax)) return undefined

    const cacheKey = `file:${configDir || '.'}:${filePath}`
    if (resolverCache[cacheKey] !== undefined) {
      const cached = resolverCache[cacheKey]
      if (subPath && cached && typeof cached === 'object') {
        return dotProp.get(cached, subPath)
      }
      return cached
    }

    try {
      const resolvedPath = path.resolve(configDir || '.', filePath)
      if (!fs.existsSync(resolvedPath)) {
        resolverCache[cacheKey] = undefined
        return undefined
      }

      const content = fs.readFileSync(resolvedPath, 'utf8')
      const parsed = parseFileContents(content, resolvedPath)

      resolverCache[cacheKey] = parsed

      if (subPath && parsed && typeof parsed === 'object') {
        return dotProp.get(parsed, subPath)
      }
      return parsed
    } catch (e) {
      resolverCache[cacheKey] = undefined
      return undefined
    }
  }

  // Simple config reference (no prefix, just a path like "foo.bar")
  // Only if it looks like a valid path (alphanumeric, dots, underscores)
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(varString)) {
    const value = dotProp.get(config, varString)
    if (value !== undefined && !hasUnresolvedVars(JSON.stringify(value), variableSyntax)) {
      return value
    }
  }

  return undefined
}

/**
 * Pre-resolve variable references in a string
 * Replaces ${varRef} patterns with resolved values where possible
 * @param {string} str - String containing variable references
 * @param {object} context - Resolution context
 * @param {object} context.config - Original config object
 * @param {string} context.configDir - Config file directory
 * @param {RegExp} context.variableSyntax - Variable syntax regex
 * @param {object} [options] - Options
 * @param {boolean} [options.formatArrays=true] - Join arrays with ", "
 * @returns {Promise<string>} String with pre-resolved variables
 */
async function preResolveString(str, context, options = {}) {
  if (typeof str !== 'string') return str

  const { formatArrays = true } = options
  const { variableSyntax } = context

  // Use provided syntax or fallback to basic pattern
  const varPattern = variableSyntax ? new RegExp(variableSyntax.source, 'g') : /\$\{([^{}]+)\}/g

  // Collect all matches first since we need async resolution
  const matches = []
  let match
  while ((match = varPattern.exec(str)) !== null) {
    matches.push({ match: match[0], index: match.index })
  }

  if (matches.length === 0) return str

  // Resolve all matches
  const resolutions = await Promise.all(matches.map(async ({ match: matchStr }) => {
    // Extract content between ${ and }
    const varContent = matchStr.slice(2, -1)

    // Skip if the content itself has ${} (nested variable)
    if (hasUnresolvedVars(varContent, variableSyntax)) {
      return matchStr
    }

    // Handle fallback syntax: ${var, fallback1, fallback2}
    // Try each in order until one resolves
    const parts = varContent.split(',').map(p => p.trim())

    for (const part of parts) {
      // Skip quoted literals for now (they're fallbacks, not resolvable)
      if (/^['"].*['"]$/.test(part)) {
        // Return the literal without quotes
        return part.slice(1, -1)
      }

      // Skip numeric literals
      if (/^\d+(\.\d+)?$/.test(part)) {
        return part
      }

      const resolved = await preResolveSingle(part, context)
      if (resolved !== undefined) {
        // Format the value
        if (Array.isArray(resolved) && formatArrays) {
          return resolved.join(', ')
        }
        if (typeof resolved === 'object') {
          return JSON.stringify(resolved)
        }
        return String(resolved)
      }
    }

    // Couldn't resolve any part, return original
    return matchStr
  }))

  // Replace matches with resolved values (in reverse order to preserve indices)
  let result = str
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match: matchStr, index } = matches[i]
    result = result.slice(0, index) + resolutions[i] + result.slice(index + matchStr.length)
  }

  return result
}

/**
 * Pre-resolve variables in an object recursively
 * @param {*} obj - Object to process
 * @param {object} context - Resolution context
 * @param {object} [options] - Options passed to preResolveString
 * @returns {Promise<*>} Object with pre-resolved variables
 */
async function preResolveObject(obj, context, options = {}) {
  if (typeof obj === 'string') {
    return preResolveString(obj, context, options)
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => preResolveObject(item, context, options)))
  }

  if (obj !== null && typeof obj === 'object') {
    const result = {}
    const entries = Object.keys(obj)
    const values = await Promise.all(entries.map(key => preResolveObject(obj[key], context, options)))
    entries.forEach((key, i) => {
      result[key] = values[i]
    })
    return result
  }

  return obj
}

module.exports = {
  preResolveSingle,
  preResolveString,
  preResolveObject,
  hasUnresolvedVars
}
