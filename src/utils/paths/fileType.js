// Classifies config files by type, treating dotenv files as ".env"
// so extension-less names like .env / .env.local / deploy.env resolve consistently
const path = require('path')

/**
 * Whether a path is a dotenv file (.env, .env.local, deploy.env, ...).
 * `path.extname('.env')` is '' (dotfile), so detection is by basename.
 * @param {string} filePath - File path or name
 * @returns {boolean} True for dotenv files
 */
function isEnvFile(filePath) {
  const base = path.basename(String(filePath || ''))
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.env')
}

/**
 * Normalized config file type: '.env' for dotenv files, else the lowercased
 * extension.
 * @param {string} filePath - File path or name
 * @returns {string} File type (e.g. '.yml', '.env', '')
 */
function configFileType(filePath) {
  if (isEnvFile(filePath)) return '.env'
  return path.extname(String(filePath || '')).toLowerCase()
}

module.exports = { isEnvFile, configFileType }
