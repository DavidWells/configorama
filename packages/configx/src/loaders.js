/* Shared CLI plumbing: locate the configorama dependency and load the
   optional configx settings file (variableSources, filters, promptRenderer, ...)
   plus configx defaults such as zero-config 1Password references. */
const fs = require('fs')
const path = require('path')
const { ConfigxError } = require('./resolveEnv')

const OP_REFERENCE_PATTERN = /\$\{\s*op(?::|\(|:\/\/)/

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
 * @param {string} cwd - Working directory to discover configx.config.*
 * @param {string|undefined} inputFile - Config file being resolved
 * @returns {object} Settings object (empty when no file found)
 */
function loadSettingsFile(explicitPath, cwd, inputFile) {
  const projectSettings = loadProjectSettingsFile(explicitPath, cwd)
  const defaults = loadDefaultSettings(inputFile, cwd)
  return mergeSettings(defaults, projectSettings)
}

/**
 * @param {string|undefined} explicitPath
 * @param {string} cwd
 * @returns {object}
 */
function loadProjectSettingsFile(explicitPath, cwd) {
  const target = explicitPath ? path.resolve(cwd, explicitPath) : findSettingsFile(cwd)

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

/**
 * @param {string} cwd
 * @returns {string}
 */
function findSettingsFile(cwd) {
  const candidates = [
    'configx.config.cjs',
    'configx.config.js',
  ].map((name) => path.join(cwd, name))
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

/**
 * @param {string|undefined} inputFile
 * @param {string} cwd
 * @returns {object}
 */
function loadDefaultSettings(inputFile, cwd) {
  if (!fileMayContainOnePasswordRefs(inputFile, cwd)) return {}
  return {
    variableSources: [
      createDefaultOnePasswordResolver(),
    ],
  }
}

/**
 * @param {object} defaults
 * @param {object} projectSettings
 * @returns {object}
 */
function mergeSettings(defaults, projectSettings) {
  const merged = { ...defaults, ...projectSettings }
  const defaultSources = Array.isArray(defaults.variableSources) ? defaults.variableSources : []
  const projectSources = Array.isArray(projectSettings.variableSources) ? projectSettings.variableSources : []
  if (defaultSources.length || projectSources.length) {
    merged.variableSources = [...defaultSources, ...projectSources]
  }
  return merged
}

/**
 * @param {string|undefined} inputFile
 * @param {string} cwd
 * @returns {boolean}
 */
function fileMayContainOnePasswordRefs(inputFile, cwd) {
  if (!inputFile || typeof inputFile !== 'string') return false
  try {
    const text = fs.readFileSync(path.resolve(cwd, inputFile), 'utf8')
    return OP_REFERENCE_PATTERN.test(text)
  } catch {
    return false
  }
}

/**
 * @returns {object}
 */
function createDefaultOnePasswordResolver() {
  const createOnePasswordResolver = loadOnePasswordResolver()
  const cache = defaultOpStashCache()
  if (!cache) return createOnePasswordResolver()

  try {
    return createOnePasswordResolver({ cache })
  } catch (err) {
    if (err && /op-stash/i.test(err.message || '')) return createOnePasswordResolver()
    throw err
  }
}

/**
 * @returns {Function}
 */
function loadOnePasswordResolver() {
  try {
    return require('configorama/plugins/onepassword')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return require('../../configorama/plugins/onepassword')
    throw err
  }
}

/**
 * @returns {object|undefined}
 */
function defaultOpStashCache() {
  if (process.env.CONFIGX_OP_STASH_DISABLED === '1' || process.env.OP_STASH_DISABLED === '1') return undefined
  return {
    provider: 'op-stash',
    ttlSeconds: Number(process.env.CONFIGX_OP_STASH_TTL_SECONDS || 300),
    scope: process.env.OP_STASH_SCOPE || 'user',
    fallbackToOp: true,
  }
}

module.exports = {
  loadConfigorama,
  loadConfigParser,
  loadSettingsFile,
  loadDefaultSettings,
}
