const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const assert = require('uvu/assert')

const ROOT = path.resolve(__dirname, '../..')
const GOLDEN_DIR = path.join(__dirname, 'goldens')

function canonicalize(value) {
  if (typeof value !== 'string') {
    value = JSON.stringify(value, stableJsonReplacer, 2)
  }
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\\/g, '/')
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

function goldenPath(name) {
  return path.join(GOLDEN_DIR, `${name}.golden`)
}

function assertGolden(name, actual) {
  const expectedPath = goldenPath(name)
  const output = canonicalize(actual)

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
