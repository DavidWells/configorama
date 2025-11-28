const os = require('os')
const fs = require('fs')
const path = require('path')
const findUp = require('find-up')
const trimSurroundingQuotes = require('./trimSurroundingQuotes')
const { resolveAlias } = require('./resolveAlias')

/**
 * Core path resolution logic - resolves a file path handling absolute paths, symlinks, and findUp
 * @param {string} pathToResolve - The path to resolve
 * @param {string} basePath - The base directory for relative paths
 * @returns {string} The resolved full file path
 */
function resolveFilePath(pathToResolve, basePath) {
  let fullFilePath = path.isAbsolute(pathToResolve) ? pathToResolve : path.join(basePath, pathToResolve)

  if (fs.existsSync(fullFilePath)) {
    // Get real path to handle potential symlinks (but don't fatal error)
    fullFilePath = fs.realpathSync(fullFilePath)
  // Only match files that are relative
  } else if (pathToResolve.match(/\.\//)) {
    const cleanName = path.basename(pathToResolve)
    const findUpResult = findUp.sync(cleanName, { cwd: basePath })
    if (findUpResult) {
      fullFilePath = findUpResult
    }
  }

  return fullFilePath
}

module.exports = function getFullPath(fileString, cwd) {
  const configPath = cwd || process.cwd()
  const relativePath = fileString.replace('~', os.homedir())
  return resolveFilePath(relativePath, configPath)
}

/**
 * Resolves a file path from a matched file string (e.g., from file() or text() syntax)
 * @param {string} matchedFileString - The matched file string (e.g., "file(path/to/file.js)")
 * @param {RegExp} syntax - The regex pattern used to match the file string (e.g., fileRefSyntax or textRefSyntax)
 * @param {string} configPath - The base directory path for resolving relative paths
 * @returns {{fullFilePath: string|null, resolvedPath: string}} - Object containing the resolved full file path and the resolved path (after alias resolution)
 */
function resolveFilePathFromMatch(matchedFileString, syntax, configPath) {
  const relativePath = trimSurroundingQuotes(
    matchedFileString.replace(syntax, (match, varName) => varName.trim()).replace('~', os.homedir()),
  )

  // Resolve alias if the path contains alias syntax
  const resolvedPath = resolveAlias(relativePath, configPath)
  const fullFilePath = resolveFilePath(resolvedPath, configPath)

  return { fullFilePath, resolvedPath, relativePath }
}

module.exports.resolveFilePathFromMatch = resolveFilePathFromMatch
