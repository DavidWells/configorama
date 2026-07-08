/* Resolves cache scope strings and process ownership metadata.
   Keeps agent/session isolation explicit instead of PID-only. */
const { ScopeError } = require('./errors')

/**
 * @param {string|undefined} requested - Requested scope
 * @param {object} [settings] - { env, pid, ppid }
 * @returns {{scope: string, ownerPid: number|undefined, kind: string}}
 */
function resolveScope(requested, settings = {}) {
  const env = settings.env || process.env
  const pid = settings.pid || process.pid
  const ppid = settings.ppid || process.ppid
  const raw = requested || env.OP_CACHE_SCOPE || 'user'
  if (raw === 'user') return { scope: 'user', ownerPid: undefined, kind: 'user' }
  if (raw === 'pid') return { scope: `pid:${pid}`, ownerPid: pid, kind: 'pid' }
  if (raw === 'ppid') return { scope: `ppid:${ppid}`, ownerPid: ppid, kind: 'ppid' }
  if (raw === 'session') {
    const session = env.OP_CACHE_SESSION || env.OP_CACHE_SCOPE
    if (!session || session === 'session') {
      throw new ScopeError('Scope "session" requires OP_CACHE_SESSION or inline --scope session:<name>.')
    }
    return { scope: normalizeSession(session), ownerPid: undefined, kind: 'session' }
  }
  if (raw.startsWith('session:')) {
    if (raw.length === 'session:'.length) {
      throw new ScopeError('Scope "session:" requires a non-empty session name.')
    }
    return { scope: raw, ownerPid: undefined, kind: 'session' }
  }
  if (!String(raw).trim()) throw new ScopeError('Scope must be a non-empty string.')
  return { scope: String(raw), ownerPid: undefined, kind: 'custom' }
}

/**
 * @param {string} value - Session env or inline value
 * @returns {string}
 */
function normalizeSession(value) {
  return value.startsWith('session:') ? value : `session:${value}`
}

module.exports = { resolveScope }
