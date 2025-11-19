const os = require('os')
const fs = require('fs')
const path = require('path')
const findUp = require('find-up')
const trimSurroundingQuotes = require('./trimSurroundingQuotes')
const { resolveAlias } = require('./resolveAlias')

module.exports = function getFullPath(fileString, cwd) {
  const configPath = cwd || process.cwd()
  const relativePath = fileString.replace('~', os.homedir())

  let fullFilePath = (path.isAbsolute(relativePath) ? relativePath : path.join(configPath, relativePath))

  if (fs.existsSync(fullFilePath)) {
    // Get real path to handle potential symlinks (but don't fatal error)
    fullFilePath = fs.realpathSync(fullFilePath)

  // Only match files that are relative
  } else if (relativePath.match(/\.\//)) {
    const cleanName = path.basename(relativePath)
    fullFilePath = findUp.sync(cleanName, { cwd: configPath })
  }

  return fullFilePath
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

  let fullFilePath = path.isAbsolute(resolvedPath) ? resolvedPath : path.join(configPath, resolvedPath)

  if (fs.existsSync(fullFilePath)) {
    // Get real path to handle potential symlinks (but don't fatal error)
    fullFilePath = fs.realpathSync(fullFilePath)

    // Only match files that are relative
  } else if (resolvedPath.match(/\.\//)) {
    // TODO test higher parent refs
    const cleanName = path.basename(resolvedPath)
    const findUpResult = findUp.sync(cleanName, { cwd: configPath })
    if (findUpResult) {
      fullFilePath = findUpResult
    }
  }

  return { fullFilePath, resolvedPath, relativePath }
}

module.exports.resolveFilePathFromMatch = resolveFilePathFromMatch
