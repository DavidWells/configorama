/* Splits string on single pipe (|) but preserves double pipes (||) */

const DOUBLE_PIPE_PLACEHOLDER = '\x00DOUBLE_PIPE\x00'
// Pre-compile regex for placeholder restoration (perf: avoid recompilation in map)
const DOUBLE_PIPE_REGEX = /\|\|/g
const PLACEHOLDER_RESTORE_REGEX = new RegExp(DOUBLE_PIPE_PLACEHOLDER, 'g')

/**
 * Splits a string on single pipe (|) characters while preserving double pipes (||).
 * This is needed for filter parsing since || is a logical operator, not a filter delimiter.
 * @param {string} str - String to split
 * @returns {string[]} - Array of parts split on single |
 */
function splitOnPipe(str) {
  if (!str || typeof str !== 'string') return [str]

  // Replace || with placeholder, split on |, restore ||
  DOUBLE_PIPE_REGEX.lastIndex = 0
  const parts = str.replace(DOUBLE_PIPE_REGEX, DOUBLE_PIPE_PLACEHOLDER).split('|')

  // Only restore placeholders if we actually had any
  if (str.indexOf('||') === -1) return parts

  return parts.map(s => {
    PLACEHOLDER_RESTORE_REGEX.lastIndex = 0
    return s.replace(PLACEHOLDER_RESTORE_REGEX, '||')
  })
}

module.exports = { splitOnPipe }
