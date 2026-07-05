/* Executes the 1Password CLI with execFile and sanitized error translation
   Never logs stdout/stderr; never passes resolved secret values as arguments */
const childProcess = require('child_process')

const AUTH_ERROR_PATTERN = /sign ?in|session|authoriz|authenticat|not currently signed|locked|service account token/i
const NOT_FOUND_PATTERN = /isn'?t an? (item|vault)|not found|no item|no vault|doesn'?t exist|more than one item/i

/**
 * Run the op binary with the given args.
 * No `command -v op` preflight: translating ENOENT is the existence check.
 * @param {string[]} args - CLI arguments
 * @param {object} [options] - { execFile, opPath, account, configDir, subject }
 * @returns {Promise<string>} stdout
 */
function runOp(args, options = {}) {
  const execFile = options.execFile || childProcess.execFile
  const binary = options.opPath || 'op'
  const finalArgs = args.slice()
  if (options.account) {
    finalArgs.push('--account', options.account)
  }
  if (options.configDir) {
    finalArgs.push('--config', options.configDir)
  }

  return new Promise((resolve, reject) => {
    execFile(binary, finalArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(translateError(err, stderr, options.subject))
      }
      resolve(stdout)
    })
  })
}

/**
 * Translate op failures into sanitized, actionable errors.
 * stderr is inspected for classification but never included in messages.
 * @param {Error & {code?: string|number}} err - execFile error
 * @param {string} stderr - Captured stderr (classification only)
 * @param {string} [subject] - Item/ref identifier already present in user config
 * @returns {Error} Sanitized error
 */
function translateError(err, stderr, subject) {
  if (err.code === 'ENOENT') {
    return new Error('1Password CLI "op" was not found on PATH. Install 1Password CLI or remove the op resolver.')
  }
  const detail = String(stderr || err.message || '')
  if (AUTH_ERROR_PATTERN.test(detail)) {
    return new Error('1Password CLI could not read the item. Run op signin, unlock 1Password app integration, or configure OP_SERVICE_ACCOUNT_TOKEN.')
  }
  if (NOT_FOUND_PATTERN.test(detail)) {
    const what = subject ? `"${subject}"` : 'the requested item, vault, or field'
    return new Error(`1Password item, vault, or field could not be found (${what}).`)
  }
  return new Error('1Password CLI command failed.')
}

/**
 * Reject config-controlled values that would be parsed as an op flag.
 * execFile takes no shell, so this is not command injection - but a
 * leading "-" turns a positional/vault value into an option that changes
 * op's behavior. Secret refs are exempt: they always start with "op://".
 * @param {string} value - Value destined for the op argument list
 * @param {string} label - Human label for the error message
 */
function assertNotFlag(value, label) {
  if (typeof value === 'string' && value.startsWith('-')) {
    throw new Error(`Invalid 1Password ${label} "${value}": ${label} cannot start with "-" (it would be read as an op flag). Use the item ID or an op:// secret reference.`)
  }
}

/**
 * Read a secret reference with op read.
 * @param {string} ref - op://vault/item/field reference
 * @param {object} [options] - { execFile, account, configDir }
 * @returns {Promise<string>} Secret value
 */
function readSecretRef(ref, options = {}) {
  return runOp(['read', '--no-newline', ref], {
    execFile: options.execFile,
    opPath: options.opPath,
    account: options.account,
    configDir: options.configDir,
    subject: ref,
  })
}

/**
 * Fetch an item as JSON with op item get.
 * --reveal is required to include concealed field values in the JSON.
 * @param {string} spec - Item ID or item name
 * @param {object} [options] - { execFile, account, configDir, vault }
 * @returns {Promise<object>} Parsed item JSON
 */
async function getItem(spec, options = {}) {
  assertNotFlag(spec, 'item')
  const args = ['item', 'get', spec, '--format', 'json', '--reveal']
  if (options.vault) {
    assertNotFlag(options.vault, 'vault')
    args.push('--vault', options.vault)
  }
  const stdout = await runOp(args, {
    execFile: options.execFile,
    opPath: options.opPath,
    account: options.account,
    configDir: options.configDir,
    subject: spec,
  })
  try {
    return JSON.parse(stdout)
  } catch (err) {
    throw new Error(`Could not parse 1Password CLI output as JSON for item "${spec}".`)
  }
}

module.exports = { runOp, readSecretRef, getItem }
