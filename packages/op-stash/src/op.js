/* Executes the 1Password CLI for op-stash misses.
   Uses op read --no-newline and sanitized errors. */
const { spawn } = require('child_process')
const { OpExecError } = require('./errors')

const AUTH_ERROR_PATTERN = /sign ?in|session|authoriz|authenticat|not currently signed|locked|service account token/i
const NOT_FOUND_PATTERN = /isn'?t an? (item|vault)|not found|no item|no vault|doesn'?t exist|does not have a field|more than one item/i

/**
 * @param {string} ref - op:// reference
 * @param {object} config - op-stash config
 * @param {object} [opts] - { account }
 * @returns {Promise<string>}
 */
function readOp(ref, config, opts = {}) {
  const args = ['read', '--no-newline', ref]
  if (opts.account) args.push('--account', opts.account)
  if (opts.configDir) args.push('--config', opts.configDir)
  return run(config.op_path || 'op', args, config.op_timeout_seconds || 30, ref)
}

/**
 * @param {string} binary - Binary
 * @param {string[]} args - Args
 * @param {number} timeoutSeconds - Timeout
 * @param {string} ref - Subject ref
 * @returns {Promise<string>}
 */
function run(binary, args, timeoutSeconds, ref) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new OpExecError(`1Password CLI read timed out after ${timeoutSeconds}s for ${ref}.`))
    }, timeoutSeconds * 1000)
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err.code === 'ENOENT') reject(new OpExecError('1Password CLI "op" was not found on PATH. Install 1Password CLI or configure op_path.'))
      else reject(new OpExecError('1Password CLI command failed.'))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) return resolve(Buffer.concat(stdout).toString('utf8'))
      reject(translateError(Buffer.concat(stderr).toString('utf8'), ref))
    })
  })
}

/**
 * @param {string} stderr - stderr
 * @param {string} ref - Subject ref
 * @returns {OpExecError}
 */
function translateError(stderr, ref) {
  const detail = String(stderr || '')
  if (AUTH_ERROR_PATTERN.test(detail)) {
    return new OpExecError('1Password CLI could not read the item. Run op signin, unlock 1Password app integration, or configure OP_SERVICE_ACCOUNT_TOKEN.')
  }
  if (NOT_FOUND_PATTERN.test(detail)) {
    return new OpExecError(`1Password item, vault, or field could not be found ("${ref}").`)
  }
  return new OpExecError('1Password CLI command failed.')
}

module.exports = { readOp, translateError }
