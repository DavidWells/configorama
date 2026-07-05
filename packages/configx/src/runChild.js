/* Spawns the child command with inherited stdio, forwards signals,
   and resolves with the exit status configx should propagate */
const os = require('os')
const { spawn } = require('child_process')

/**
 * Run the child command and report its exit status.
 * @param {string} program - Command
 * @param {string[]} args - Command arguments
 * @param {object} env - Child environment
 * @returns {Promise<number>} exit code to propagate (128+signal for signals, 127 for spawn failures)
 */
function runChild(program, args, env) {
  return new Promise((resolve) => {
    const child = spawn(program, args, { stdio: 'inherit', env, shell: false })

    const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP']
    for (const signal of forwarded) {
      process.on(signal, () => child.kill(signal))
    }

    child.on('error', (err) => {
      const message = err.code === 'ENOENT' ? `command not found: ${program}` : `failed to spawn ${program}: ${err.message}`
      process.stderr.write(`configx: ${message}\n`)
      resolve(127)
    })

    child.on('exit', (code, signal) => {
      if (signal) {
        const num = os.constants.signals[signal] || 0
        resolve(128 + num)
        return
      }
      resolve(code == null ? 0 : code)
    })
  })
}

module.exports = {
  runChild,
}
