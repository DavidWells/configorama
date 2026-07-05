/* Normalizes 1Password references into canonical secretRef/item/privateLink forms
   Validates aliases, parses private item links, rejects public share links */

const ALIAS_PATTERN = /^[A-Za-z0-9_]+$/
// 1Password item and vault IDs are 26-character lowercase base32 strings.
const ITEM_ID_PATTERN = /^[a-z0-9]{26}$/
const PRIVATE_LINK_PREFIXES = ['https://start.1password.com/open/i', 'onepassword://open/i']

/**
 * Whether a string has the shape of a 1Password item ID (26-char base32).
 * Used to let colon syntax accept a bare item ID where an alias would go.
 * @param {string} value - Candidate string
 * @returns {boolean} True when it looks like an item ID
 */
function isItemId(value) {
  return ITEM_ID_PATTERN.test(value)
}

/**
 * Validate an alias name from the refs config.
 * Dots are reserved as the key path separator so they cannot appear in aliases.
 * @param {string} alias - Alias name to validate
 */
function validateAliasName(alias) {
  if (!ALIAS_PATTERN.test(alias)) {
    throw new Error(`Invalid 1Password alias "${alias}". Aliases may contain only letters, numbers, and underscores.`)
  }
}

/**
 * Check whether a string is a private item link.
 * @param {string} value - Candidate string
 * @returns {boolean} True when the string is a private item link
 */
function isPrivateLink(value) {
  return PRIVATE_LINK_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * Recognize abbreviated private-link forms where the scheme, host, and/or
 * path have been stripped, leaving the query params (e.g. "open/i?...&i=ID",
 * or a bare "v=VAULT&i=ID"). Requires an "i=" param plus a 1Password marker
 * or a pure query string, so ordinary item names and unrelated URLs are not
 * misread as links.
 * @param {string} value - Candidate string
 * @returns {boolean} True when the string looks like private-link query params
 */
function looksLikeLinkParams(value) {
  const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value
  if (!/(?:^|&)i=[^&]/.test(query)) return false
  return /1password\.com/.test(value) || /(?:^|\/)open\/i/.test(value) || !value.includes('/')
}

/**
 * Parse a "Copy Private Link" URL (or an abbreviated form) into item and
 * vault IDs. The a (account) and h (host) params identify the account and are
 * intentionally dropped; item + vault IDs are all op item get needs.
 * @param {string} url - Private item link or its query params
 * @returns {{kind: string, item: string, vault: string|undefined, warnings: Array<{code: string, message: string}>}} Normalized reference
 */
function parsePrivateLink(url) {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : url
  const params = new URLSearchParams(query)
  const item = params.get('i')
  const vault = params.get('v')

  if (!item) {
    throw new Error('Invalid 1Password private link. Expected query parameter "i" with the item ID.')
  }

  const warnings = []
  if (!vault) {
    warnings.push({
      level: 'warning',
      code: 'op_private_link_missing_vault',
      message: '1Password private link did not include a vault ID; service accounts and duplicate item names may require vault scoping.',
    })
  }

  return { kind: 'privateLink', item, vault: vault || undefined, warnings }
}

/**
 * Normalize a string or object ref value into a canonical reference.
 * Accepted forms: op:// string, item name string, private link string,
 * { item, vault, section, field }, { ref }, { url }.
 * @param {string|object} value - Ref value from config or direct spec
 * @returns {object} Normalized reference ({ kind: 'secretRef'|'item'|'privateLink', ... })
 */
function normalizeRefValue(value) {
  if (typeof value === 'string') {
    return normalizeStringRef(value)
  }
  if (value && typeof value === 'object') {
    return normalizeObjectRef(value)
  }
  throw new Error(`Invalid 1Password reference. Expected a string or object, got ${typeof value}.`)
}

/**
 * @param {string} value - String ref (secret ref, link, or item name)
 * @returns {object} Normalized reference
 */
function normalizeStringRef(value) {
  if (value.startsWith('op://')) {
    return { kind: 'secretRef', ref: value }
  }
  // Public share links are rejected in any form (full URL or share token).
  if (value.includes('share.1password.com') || /1password\.com\/s#/.test(value)) {
    throw new Error('Public 1Password share links are not supported. Use Copy Private Link or an op:// secret reference.')
  }
  // Private links: full URL, onepassword://, or an abbreviated form carrying
  // the query params (scheme/host/path stripped).
  if (isPrivateLink(value) || looksLikeLinkParams(value)) {
    return parsePrivateLink(value)
  }
  if (/^https?:\/\/|^onepassword:\/\//.test(value)) {
    throw new Error('Unrecognized 1Password link. Use Copy Private Link or an op:// secret reference.')
  }
  return { kind: 'item', item: value, vault: undefined, section: undefined, field: undefined }
}

/**
 * @param {object} value - Object ref ({ item }, { ref }, or { url })
 * @returns {object} Normalized reference
 */
function normalizeObjectRef(value) {
  const specifiers = ['item', 'ref', 'url'].filter((key) => value[key] !== undefined)
  if (specifiers.length !== 1) {
    throw new Error('Invalid 1Password reference. Object refs must specify exactly one of "item", "ref", or "url".')
  }

  if (value.ref !== undefined) {
    return normalizeStringRef(value.ref)
  }
  if (value.url !== undefined) {
    const normalized = normalizeStringRef(value.url)
    if (normalized.kind !== 'privateLink') {
      throw new Error('Invalid 1Password reference. "url" must be a private item link.')
    }
    return normalized
  }

  if (value.section !== undefined && value.field === undefined) {
    throw new Error('Invalid 1Password reference. "section" is only meaningful together with "field".')
  }

  return {
    kind: 'item',
    item: value.item,
    vault: value.vault,
    section: value.section,
    field: value.field,
  }
}

module.exports = { validateAliasName, normalizeRefValue, parsePrivateLink, isPrivateLink, isItemId }
