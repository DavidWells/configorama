// Writes env answers to a dotenv file safely: strict key validation, quoting
// that round-trips, 0600 permissions, managed-block merge, atomic writes.
const fs = require('fs')
const path = require('path')
const { ConfigoramaError } = require('../../errors')

const MANAGED_BLOCK_START = '# >>> configx setup values >>>'
const MANAGED_BLOCK_END = '# <<< configx setup values <<<'

const VALID_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const PLAIN_VALUE = /^[A-Za-z0-9_./:@+=-]*$/

/**
 * Quote a value so common dotenv parsers read it back verbatim
 * @param {string} value - raw value
 * @returns {string} dotenv-safe representation
 */
function quoteDotenvValue(value) {
  const str = String(value)
  if (PLAIN_VALUE.test(str)) return str
  // Single quotes are literal in dotenv - no expansion of $ or escapes
  if (!str.includes("'") && !str.includes('\n')) return `'${str}'`
  const escaped = str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
  return `"${escaped}"`
}

/**
 * Render KEY=value lines for the given values
 * @param {Object.<string, any>} values - env key/value pairs
 * @returns {string[]} dotenv lines
 */
function renderLines(values) {
  return Object.entries(values).map(([key, value]) => `${key}=${quoteDotenvValue(value)}`)
}

/**
 * Replace or append the managed block in existing dotenv content
 * @param {string} content - current file content
 * @param {string[]} lines - new KEY=value lines for the block
 * @param {string} filePath - target path for error messages
 * @returns {string} updated file content
 */
function mergeManagedBlock(content, lines, filePath) {
  const startCount = content.split(MANAGED_BLOCK_START).length - 1
  const endCount = content.split(MANAGED_BLOCK_END).length - 1

  if (startCount > 1 || endCount > 1 || startCount !== endCount) {
    throw new ConfigoramaError(
      'managed_block_invalid',
      `Cannot merge into ${filePath}: expected exactly one intact managed block, found ${startCount} start and ${endCount} end marker(s).`
    )
  }

  const block = [MANAGED_BLOCK_START, ...lines, MANAGED_BLOCK_END].join('\n')

  if (startCount === 0) {
    const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n'
    return `${content}${separator}${block}\n`
  }

  const startIndex = content.indexOf(MANAGED_BLOCK_START)
  const endIndex = content.indexOf(MANAGED_BLOCK_END)
  if (endIndex < startIndex) {
    throw new ConfigoramaError(
      'managed_block_invalid',
      `Cannot merge into ${filePath}: managed block markers are out of order.`
    )
  }
  return content.slice(0, startIndex) + block + content.slice(endIndex + MANAGED_BLOCK_END.length)
}

/**
 * Write values atomically: temp file in the same directory, then rename
 * @param {string} filePath - target path
 * @param {string} content - file content
 * @param {number} mode - file mode for new files
 */
function atomicWrite(filePath, content, mode) {
  const dir = path.dirname(filePath)
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.configx-tmp-${process.pid}`)
  fs.writeFileSync(tmpPath, content, { mode })
  try {
    fs.renameSync(tmpPath, filePath)
  } catch (err) {
    fs.unlinkSync(tmpPath)
    throw err
  }
}

/**
 * Write env answers to a dotenv file
 * @param {string} filePath - target dotenv path
 * @param {Object.<string, any>} values - env key/value pairs to write
 * @param {Object} [opts] - write behavior
 * @param {boolean} [opts.merge] - replace/append the managed block, preserving other content
 * @param {boolean} [opts.force] - overwrite the whole file if it exists
 * @returns {{ path: string, keys: string[] }} written target and key names for summaries
 */
function writeDotenv(filePath, values, opts = {}) {
  const keys = Object.keys(values || {})
  for (const key of keys) {
    if (!VALID_KEY.test(key)) {
      throw new ConfigoramaError(
        'invalid_env_key',
        `Cannot write "${key}" to ${filePath}: dotenv keys must match ${VALID_KEY}.`
      )
    }
  }

  const lines = renderLines(values)
  const exists = fs.existsSync(filePath)

  if (exists && !opts.merge && !opts.force) {
    throw new ConfigoramaError(
      'target_file_exists',
      `${filePath} already exists. Pass --merge to update the managed block or --force to overwrite.`
    )
  }

  let content
  let mode = 0o600
  if (opts.merge) {
    const existingContent = exists ? fs.readFileSync(filePath, 'utf8') : ''
    if (exists) mode = fs.statSync(filePath).mode & 0o777
    content = mergeManagedBlock(existingContent, lines, filePath)
  } else {
    content = `${lines.join('\n')}\n`
  }

  atomicWrite(filePath, content, mode)
  return { path: filePath, keys }
}

module.exports = {
  writeDotenv,
  quoteDotenvValue,
  MANAGED_BLOCK_START,
  MANAGED_BLOCK_END,
}
