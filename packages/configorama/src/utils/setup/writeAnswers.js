// Writes setup answers to a versioned JSON file for automation (agents, CI).
// Answers can contain raw secrets, so writes are 0600, atomic, and overwrite-safe.
const fs = require('fs')
const path = require('path')
const { ConfigoramaError } = require('../../errors')
const { normalizeAnswerGroups } = require('./setupEngine')

/**
 * Write setup answers to a JSON file
 * @param {string} filePath - target path
 * @param {Object} answers - answer groups { options, env, self, dotProp }
 * @param {Object} [opts] - write behavior
 * @param {boolean} [opts.force] - overwrite an existing file
 * @returns {{ path: string, groups: Object.<string, string[]> }} written target and key names per group
 */
function writeAnswers(filePath, answers, opts = {}) {
  if (fs.existsSync(filePath) && !opts.force) {
    throw new ConfigoramaError(
      'target_file_exists',
      `${filePath} already exists. Pass --force to overwrite.`
    )
  }

  const normalized = normalizeAnswerGroups(answers)
  const payload = {
    schemaVersion: 1,
    answers: normalized,
  }

  const dir = path.dirname(filePath)
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.configx-tmp-${process.pid}`)
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.renameSync(tmpPath, filePath)
  } catch (err) {
    fs.unlinkSync(tmpPath)
    throw err
  }

  /** @type {Object.<string, string[]>} */
  const groups = {}
  for (const [group, values] of Object.entries(normalized)) {
    groups[group] = Object.keys(values)
  }
  return { path: filePath, groups }
}

module.exports = {
  writeAnswers,
}
