/* In-memory TTL/LRU cache used by the daemon.
   Supports scoped clearing and entry counts without exposing raw refs. */

class SecretCache {
  /**
   * @param {object} options - Cache options
   */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 1000
    this.now = options.now || (() => Date.now())
    this.map = new Map()
    this.hits = 0
    this.misses = 0
  }

  /**
   * @param {string} key - Opaque cache key
   * @returns {string|undefined}
   */
  get(key) {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses += 1
      return undefined
    }
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key)
      this.misses += 1
      return undefined
    }
    if (entry.ownerPid && !isPidAlive(entry.ownerPid)) {
      this.map.delete(key)
      this.misses += 1
      return undefined
    }
    entry.lastAccessedAt = this.now()
    this.map.delete(key)
    this.map.set(key, entry)
    this.hits += 1
    return entry.value
  }

  /**
   * @param {string} key - Opaque cache key
   * @param {string} value - Secret value
   * @param {object} meta - Entry metadata
   */
  set(key, value, meta) {
    const now = this.now()
    this.map.set(key, {
      value,
      expiresAt: now + meta.ttlSeconds * 1000,
      createdAt: now,
      lastAccessedAt: now,
      scope: meta.scope,
      ownerPid: meta.ownerPid,
      refHash: meta.refHash,
      accountHash: meta.accountHash,
    })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
  }

  sweep() {
    const now = this.now()
    let removed = 0
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt <= now || (entry.ownerPid && !isPidAlive(entry.ownerPid))) {
        this.map.delete(key)
        removed += 1
      }
    }
    return removed
  }

  clear(scope) {
    if (!scope) {
      const removed = this.map.size
      this.map.clear()
      this.hits = 0
      this.misses = 0
      return removed
    }
    return this.clearScope(scope)
  }

  clearScope(scope) {
    let removed = 0
    for (const [key, entry] of this.map.entries()) {
      if (entry.scope === scope) {
        this.map.delete(key)
        removed += 1
      }
    }
    return removed
  }

  countByScope(scope) {
    this.sweep()
    let n = 0
    for (const entry of this.map.values()) {
      if (entry.scope === scope) n += 1
    }
    return n
  }

  isEmpty() {
    this.sweep()
    return this.map.size === 0
  }

  stats(scope) {
    this.sweep()
    if (scope) return { scope, entries: this.countByScope(scope) }
    const total = this.hits + this.misses
    return {
      entries: this.map.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? this.hits / total : 0,
    }
  }
}

/**
 * @param {number} pid - Process ID
 * @returns {boolean}
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err && err.code === 'EPERM'
  }
}

module.exports = { SecretCache, isPidAlive }
