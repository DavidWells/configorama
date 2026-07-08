/* Builds synthetic cache refs for final-value op-stash entries.
   NUL-joined fixed-order dimensions hashed with SHA-256 — never raw links. */
const crypto = require('crypto')

// Bump whenever field-selection semantics or the envelope shape change:
// old entries then live under unreachable keys and expire unread.
const CACHE_REF_SCHEMA_VERSION = 'v1'

/**
 * Deterministic cache reference for one final-value resolver operation.
 * Dimensions are requested inputs only — never discovered outputs — so the
 * key is computable before any op call. account/configDir/opPath are NOT
 * included here; they travel via getOrSet opts and op-stash applies them as
 * key dimensions, exactly as it does for read (one owner per dimension).
 * @param {object} reference - Normalized reference ({ kind, item, vault, section, field, ref })
 * @param {string|undefined} keyPath - Requested key path
 * @returns {string} configorama-op://v1/<sha256hex>
 */
function buildCacheRef(reference, keyPath) {
  const itemOrRef = reference.kind === 'secretRef' ? reference.ref : reference.item
  const parts = [
    CACHE_REF_SCHEMA_VERSION,
    reference.kind || '',
    itemOrRef || '',
    reference.vault || '',
    reference.section || '',
    reference.field || '',
    keyPath || '',
  ]
  const hash = crypto.createHash('sha256').update(parts.join('\0')).digest('hex')
  return `configorama-op://${CACHE_REF_SCHEMA_VERSION}/${hash}`
}

module.exports = { buildCacheRef, CACHE_REF_SCHEMA_VERSION }
