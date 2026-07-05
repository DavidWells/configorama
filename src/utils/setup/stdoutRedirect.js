// Temporarily delegates process.stdout writes to another stream so interactive
// prompt UI can render elsewhere (e.g. stderr) while stdout stays machine-clean.

const MIRRORED_TTY_PROPS = ['rows', 'columns', 'isTTY']

/**
 * Run fn with all process.stdout writes forwarded to target.
 * TTY dimensions are mirrored from target so prompt layout matches the
 * stream it actually renders on (stdout is often a pipe in --export mode).
 * @param {import('stream').Writable} target - stream that receives the writes
 * @param {Function} fn - async function to run while redirected
 * @returns {Promise<any>} fn's result
 */
async function withStdoutRedirected(target, fn) {
  const originalWrite = process.stdout.write
  const savedDescriptors = {}

  process.stdout.write = (chunk, encoding, callback) => target.write(chunk, encoding, callback)

  for (const prop of MIRRORED_TTY_PROPS) {
    if (target[prop] === undefined) continue
    savedDescriptors[prop] = Object.getOwnPropertyDescriptor(process.stdout, prop) || null
    Object.defineProperty(process.stdout, prop, {
      configurable: true,
      enumerable: true,
      get() { return target[prop] },
    })
  }

  try {
    return await fn()
  } finally {
    process.stdout.write = originalWrite
    for (const [prop, descriptor] of Object.entries(savedDescriptors)) {
      if (descriptor) {
        Object.defineProperty(process.stdout, prop, descriptor)
      } else {
        delete process.stdout[prop]
      }
    }
  }
}

module.exports = {
  withStdoutRedirected,
}
