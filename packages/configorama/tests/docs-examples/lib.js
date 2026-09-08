// Shared helpers for docs examples: split showcase from edge cases and resolve.
// A source fixture is one YAML file whose showcase portion is rendered into the
// docs site; everything after a `## edge` divider line is tested but not shown.

const fs = require('fs')
const path = require('path')
const configorama = require('../../src')

const SOURCES_DIR = path.join(__dirname, 'sources')
const EDGE_DIVIDER = /^##\s+edge\b/i

/**
 * Split a source fixture into the docs-visible showcase and the full text.
 * `##` lines are YAML comments, so the full text (showcase + edge) still parses.
 * @param {string} yamlText
 * @returns {{ showcase: string, full: string }}
 */
function splitShowcase(yamlText) {
  const lines = yamlText.split('\n')
  const dividerIdx = lines.findIndex((l) => EDGE_DIVIDER.test(l))
  const showcase = (dividerIdx === -1 ? lines : lines.slice(0, dividerIdx))
    .join('\n')
    .replace(/\s+$/, '') + '\n'
  return { showcase, full: yamlText }
}

/**
 * Load a source fixture by id.
 * @param {string} id
 * @returns {{ showcase: string, full: string, file: string }}
 */
function loadSource(id) {
  const file = path.join(SOURCES_DIR, `${id}.yml`)
  const text = fs.readFileSync(file, 'utf8')
  return { ...splitShowcase(text), file }
}

/**
 * Resolve an example's full fixture with its declared options/env.
 * @param {{ id: string, options?: Object, env?: Object }} entry
 * @returns {Promise<Object>} the resolved config
 */
async function resolveExample(entry) {
  const file = path.join(SOURCES_DIR, `${entry.id}.yml`)
  const savedEnv = process.env
  if (entry.env) process.env = { ...process.env, ...entry.env }
  try {
    return await configorama(file, { configDir: SOURCES_DIR, options: entry.options || {} })
  } finally {
    process.env = savedEnv
  }
}

module.exports = { SOURCES_DIR, splitShowcase, loadSource, resolveExample }
