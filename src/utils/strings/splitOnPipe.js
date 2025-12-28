/* Splits string on single pipe (|) but preserves double pipes (||) */

const DOUBLE_PIPE_PLACEHOLDER = '\x00DOUBLE_PIPE\x00'

/**
 * Splits a string on single pipe (|) characters while preserving double pipes (||).
 * This is needed for filter parsing since || is a logical operator, not a filter delimiter.
 * @param {string} str - String to split
 * @returns {string[]} - Array of parts split on single |
 */
function splitOnPipe(str) {
  if (!str || typeof str !== 'string') return [str]

  // Replace || with placeholder, split on |, restore ||
  return str
    .replace(/\|\|/g, DOUBLE_PIPE_PLACEHOLDER)
    .split('|')
    .map(s => s.replace(new RegExp(DOUBLE_PIPE_PLACEHOLDER, 'g'), '||'))
}

module.exports = { splitOnPipe }
