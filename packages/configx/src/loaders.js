/* Shared CLI plumbing: locate the configorama dependency and load the
   optional configx settings file (variableSources, filters, promptRenderer, ...) */
const fs = require('fs')
const path = require('path')
const { ConfigxError } = require('./resolveEnv')

/**
 * Load configorama from the installed dependency, falling back to the
 * in-repo source when running inside the configorama monorepo.
 * @returns {Function} configorama async API
 */
function loadConfigorama() {
  try {
    return require('configorama')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return require('../../configorama/src')
    throw err
  }
}

/**
 * Load configorama's file parser the same way loadConfigorama resolves the package.
 * @returns {{ parseFile: Function }} parse-file module
 */
function loadConfigParser() {
  try {
    return require('configorama/parse-file')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return require('../../configorama/src/utils/parsing/parse')
    throw err
  }
}

/**
 * Load an optional configx settings file exporting configorama settings
 * (variableSources, filters, functions, safeMode, ...). This file is
 * executed — configx is an execution tool and treats it as trusted.
 * @param {string|undefined} explicitPath - Path from --config
 * @param {string} cwd - Working directory to discover configx.config.js
 * @returns {object} Settings object (empty when no file found)
 */
function loadSettingsFile(explicitPath, cwd) {
  const target = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.join(cwd, 'configx.config.js')

  if (!fs.existsSync(target)) {
    if (explicitPath) throw new ConfigxError('settings_file_not_found', `config file not found: ${target}`)
    return {}
  }

  let loaded
  try {
    loaded = require(target)
  } catch (err) {
    throw new ConfigxError('settings_file_invalid', `failed to load config file ${target}: ${err.message}`)
  }
  if (loaded && typeof loaded === 'object') return loaded
  throw new ConfigxError('settings_file_invalid', `config file ${target} must export a settings object`)
}

module.exports = {
  loadConfigorama,
  loadConfigParser,
  loadSettingsFile,
}
