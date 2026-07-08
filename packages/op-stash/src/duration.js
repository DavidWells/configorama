/* Parses user-facing TTL duration strings.
   Accepts seconds, minutes, and hours with strict positive integer rules. */
const { UsageError } = require('./errors')

const ACCEPTED = 'Accepted formats: 30s, 5m, 1h, or bare seconds like 300.'

/**
 * @param {string|number|undefined} value - Duration input
 * @param {string} [label] - Label for error messages
 * @returns {number|undefined} Positive integer seconds
 */
function parseDurationSeconds(value, label = 'duration') {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) return value
    throw new UsageError(`Invalid ${label}: ${value}. ${ACCEPTED}`)
  }
  const input = String(value).trim()
  const match = input.match(/^([1-9][0-9]*)([smh]?)$/)
  if (!match) {
    throw new UsageError(`Invalid ${label}: ${input}. ${ACCEPTED}`)
  }
  const n = Number(match[1])
  const unit = match[2] || 's'
  const multiplier = unit === 'h' ? 3600 : unit === 'm' ? 60 : 1
  return n * multiplier
}

module.exports = { parseDurationSeconds, ACCEPTED }
