const { spawn } = require('node:child_process')
const path = require('node:path')

/* Own the process group so a timed-out sync case cannot strand its RPC worker. */
function runChild(args, options = {}) {
  const timeout = options.timeout || 10000
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32'
    const child = spawn(process.execPath, args, { cwd: options.cwd || path.resolve(__dirname, '../..'), env: options.env || process.env,
      detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let timedOut = false
    const stop = () => {
      try { if (grouped) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch (error) { if (error.code !== 'ESRCH') reject(error) }
    }
    const timer = setTimeout(() => { timedOut = true; stop() }, timeout)
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 1024 * 1024) stop() })
    child.stderr.on('data', data => { stderr += data; if (stderr.length > 1024 * 1024) stop() })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut, stdout, stderr, pid: child.pid }) })
  })
}
function runCase(name, options) { return runChild(['scripts/reliability-probes.js', '--child', name], options) }
module.exports = { runChild, runCase }
