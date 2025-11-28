// Utilities for parsing and normalizing file paths in variable references

const { splitCsv } = require('./splitCsv')

/**
 * Normalize a file path (add ./ prefix, fix .//, skip deep refs)
 * @param {string} filePath - The file path to normalize
 * @returns {string|null} Normalized path, or null if should be skipped
 */
function normalizePath(filePath) {
  // Skip deep references
  if (filePath.includes('deep:')) {
    return null
  }

  let normalized = filePath

  // Add ./ prefix for relative paths
  if (
    !filePath.startsWith('./') &&
    !filePath.startsWith('../') &&
    !filePath.startsWith('/') &&
    !filePath.startsWith('~')
  ) {
    normalized = './' + filePath
  }

  // Fix double slashes
  if (normalized.startsWith('.//')) {
    normalized = normalized.replace('.//', './')
  }

  return normalized
}

/**
 * Extract file path from a file() or text() variable string
 * @param {string} variableString - The variable string (with or without ${} wrapper)
 * @returns {object|null} Object with filePath, or null if no match
 */
function extractFilePath(variableString) {
  // Match both ${file(...)} and file(...) formats
  const fileMatch = variableString.match(/^(?:\$\{)?(?:file|text)\((.*?)\)/)
  if (!fileMatch || !fileMatch[1]) {
    return null
  }

  const { trimSurroundingQuotes } = require('./quoteUtils')
  const fileContent = fileMatch[1].trim()
  const parts = splitCsv(fileContent)
  let filePath = parts[0].trim()

  // Remove quotes if present
  filePath = trimSurroundingQuotes(filePath, false)

  return { filePath }
}

/**
 * Normalize a file() or text() variable string
 * Strips key accessors and normalizes the path inside
 * @param {string} variableString - e.g. "file('./config.json'):key" or "file(config.json)"
 * @returns {string} Normalized variable string, e.g. "file(./config.json)"
 */
function normalizeFileVariable(variableString) {
  if (!variableString.match(/^(?:file|text)\(/)) {
    return variableString
  }

  // Strip sub-key accessors like :topLevel, :nested.value, etc.
  let normalized = variableString.replace(/:[\w.[\]]+$/, '')

  // Normalize the path inside
  normalized = normalized.replace(/^(file|text)\((.+?)\)/, (match, funcName, filePath) => {
    let cleanPath = filePath.trim().replace(/^["']|["']$/g, '')
    const normalizedPath = normalizePath(cleanPath)
    return normalizedPath ? `${funcName}(${normalizedPath})` : match
  })

  return normalized
}

/**
 * Resolve inner variables in a string from config values
 * @param {string} str - String containing variables like ${self:stage}
 * @param {RegExp} variableSyntax - Regex to match variable syntax
 * @param {object} config - Config object to look up values
 * @param {function} getProp - Function to get nested property (e.g. dotProp.get)
 * @returns {{resolved: string, didResolve: boolean}} Resolved string and whether resolution happened
 */
function resolveInnerVariables(str, variableSyntax, config, getProp) {
  const varMatches = str.match(variableSyntax)
  if (!varMatches) {
    return { resolved: str, didResolve: false }
  }

  let canResolve = true
  let resolved = str
  for (const varMatch of varMatches) {
    const innerVar = varMatch.slice(2, -1) // Remove ${ and }
    let configPath = null

    // Handle self: prefix
    if (innerVar.startsWith('self:')) {
      configPath = innerVar.slice(5)
    } else if (!innerVar.includes(':')) {
      // dot.prop style
      configPath = innerVar
    }

    if (configPath) {
      const configValue = getProp(config, configPath)
      // Only use if it's a static value (not another variable)
      if (configValue !== undefined &&
          typeof configValue === 'string' &&
          !configValue.match(variableSyntax)) {
        resolved = resolved.replace(varMatch, configValue)
      } else {
        canResolve = false
        break
      }
    } else {
      canResolve = false
      break
    }
  }

  return { resolved: canResolve ? resolved : str, didResolve: canResolve }
}

module.exports = {
  normalizePath,
  extractFilePath,
  normalizeFileVariable,
  resolveInnerVariables,
}
