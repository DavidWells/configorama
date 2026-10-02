const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const assert = require('uvu/assert')

const ROOT = path.resolve(__dirname, '../..')
const GOLDEN_DIR = path.join(__dirname, 'goldens')

/**
 * Stable text for a golden: sorted JSON keys, LF endings, machine paths masked
 * @param {any} value
 * @param {{ keepBackslashes?: boolean }} [options] - keepBackslashes: leave \ as is (config values,
 *   where \n or \" is data) instead of turning Windows path separators into /
 * @returns {string}
 */
function canonicalize(value, options = {}) {
  if (typeof value !== 'string') {
    value = JSON.stringify(value, stableJsonReplacer, 2)
  }
  const text = String(value).replace(/\r\n/g, '\n')
  return (options.keepBackslashes ? text : text.replace(/\\/g, '/'))
    .replaceAll(ROOT, '<ROOT>')
    .replace(/\/Users\/[^/\n]+/g, '/Users/<USER>')
    .trimEnd() + '\n'
}

function stableJsonReplacer(key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.keys(value).sort().reduce((acc, itemKey) => {
    acc[itemKey] = value[itemKey]
    return acc
  }, {})
}

function goldenPath(name, dir = GOLDEN_DIR) {
  return path.join(dir, `${name}.golden`)
}

function assertGolden(name, actual, dir = GOLDEN_DIR, options = {}) {
  const expectedPath = goldenPath(name, dir)
  const output = canonicalize(actual, options)

  if (process.env.UPDATE_GOLDENS) {
    fs.mkdirSync(path.dirname(expectedPath), { recursive: true })
    fs.writeFileSync(expectedPath, output)
    return
  }

  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Golden file missing: ${expectedPath}\nRun with UPDATE_GOLDENS=1 to create it.`)
  }

  const expected = fs.readFileSync(expectedPath, 'utf8')
  if (expected !== output) {
    const actualPath = expectedPath.replace(/\.golden$/, '.actual')
    fs.writeFileSync(actualPath, output)
    assert.is(output, expected, `Golden mismatch for ${name}. Actual written to ${actualPath}`)
  }
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'cli.js')].concat(args), {
    cwd: options.cwd || ROOT,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
  })

  return {
    status: result.status,
    stdout: canonicalize(result.stdout || ''),
    stderr: canonicalize(result.stderr || ''),
  }
}

async function runApi(fn) {
  try {
    return {
      ok: true,
      value: await fn(),
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      }
    }
  }
}

module.exports = {
  ROOT,
  assertGolden,
  canonicalize,
  runApi,
  runCli,
}
