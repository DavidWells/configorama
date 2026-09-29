/* Shared helpers for the property-based fuzz tests (fast-check).                       */
/*                                                                                        */
/* Runs are deterministic by default so `npm test` is stable. Explore with:               */
/*   FUZZ_RUNS=5000 FUZZ_SEED=random node tests/fuzz/fuzz.test.js                         */
/* A failure prints its seed and path; replay it with FUZZ_SEED=<seed> FUZZ_PATH=<path>.  */
const fs = require('fs')
const os = require('os')
const path = require('path')
const fc = require('fast-check')

const DEFAULT_SEED = 20260928

/**
 * fast-check parameters from FUZZ_RUNS / FUZZ_SEED / FUZZ_PATH
 * @param {number} defaultRuns - Runs for a normal `npm test`
 * @returns {import('fast-check').Parameters<any>}
 */
function fuzzParams(defaultRuns) {
  const runs = Number(process.env.FUZZ_RUNS) || defaultRuns
  const seedEnv = process.env.FUZZ_SEED
  const seed = seedEnv === 'random' ? Date.now() ^ Math.floor(Math.random() * 0x7fffffff) : Number(seedEnv) || DEFAULT_SEED
  /** @type {import('fast-check').Parameters<any>} */
  const params = { numRuns: runs, seed, endOnFailure: false, includeErrorInReport: true }
  if (process.env.FUZZ_PATH) params.path = process.env.FUZZ_PATH
  return params
}

let dir = ''
let count = 0

/**
 * Write YAML text to a temp file
 * @param {string} yml - File contents
 * @returns {string} File path
 */
function writeYaml(yml) {
  if (!dir) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-fuzz-'))
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
  }
  const file = path.join(dir, `case-${count++}.yml`)
  fs.writeFileSync(file, yml)
  return file
}

/**
 * @typedef {{ ok: true, value: any } | { ok: false, error: Error }} Outcome
 */

/**
 * Run fn with console output and stdout writes captured, not printed
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, stdout: string }>}
 */
async function captureOutput(fn) {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info, write: process.stdout.write }
  let stdout = ''
  // Library code must never write to stdout (AGENTS.md "stdout hygiene"); count it all
  // @ts-ignore - test stub
  process.stdout.write = (chunk) => { stdout += String(chunk); return true }
  console.log = (...args) => { stdout += args.join(' ') + '\n' }
  console.error = console.warn = console.info = () => {}
  try {
    const result = await fn()
    return { result, stdout }
  } finally {
    Object.assign(console, { log: original.log, error: original.error, warn: original.warn, info: original.info })
    process.stdout.write = original.write
  }
}

/**
 * Resolve YAML text with both the async and the sync API
 * @param {string} yml - YAML text
 * @param {object} [settings] - configorama settings
 * @param {{ sync?: boolean }} [run] - sync: false skips the sync API (e.g. for in-process spies)
 * @returns {Promise<{ async: Outcome, sync: Outcome, stdout: string }>}
 */
async function resolveBoth(yml, settings = {}, run = {}) {
  const configorama = require('../../src')
  const file = writeYaml(yml)
  const opts = Object.assign({ configDir: path.dirname(file), options: {} }, settings)
  const { result, stdout } = await captureOutput(async () => {
    /** @type {Outcome} */
    let asyncOutcome
    /** @type {Outcome} */
    let syncOutcome
    try {
      asyncOutcome = { ok: true, value: await configorama(file, opts) }
    } catch (error) {
      asyncOutcome = { ok: false, error }
    }
    if (run.sync === false) return { async: asyncOutcome, sync: asyncOutcome }
    try {
      syncOutcome = { ok: true, value: configorama.sync(file, opts) }
    } catch (error) {
      syncOutcome = { ok: false, error }
    }
    return { async: asyncOutcome, sync: syncOutcome }
  })
  return Object.assign(result, { stdout })
}

/**
 * A thrown JS runtime error (a bug), as opposed to a configorama error about the config
 * @param {Error} error
 * @returns {boolean}
 */
function isCrash(error) {
  return error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError ||
    /is not a function|Cannot read propert|is not iterable|Maximum call stack/.test(String(error && error.message))
}

/**
 * First line of an outcome, for failure messages
 * @param {Outcome} outcome
 * @returns {string}
 */
function describe(outcome) {
  if (outcome.ok) return `value ${JSON.stringify(outcome.value)}`
  return `${outcome.error.name}: ${String(outcome.error.message).split('\n').find((l) => l.trim())}`
}

/** A property violation. `kind` groups failures in the survey; `detail` is the evidence */
class PropertyFailure extends Error {
  /**
   * @param {string} kind - Short failure class, e.g. 'value changes'
   * @param {Record<string, any>} detail - Case evidence (expression, value, what came back)
   */
  constructor(kind, detail) {
    const lines = Object.entries(detail).map(([k, v]) => `  ${k.padEnd(6)} ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    super(`${kind}\n${lines.join('\n')}`)
    this.name = 'PropertyFailure'
    this.kind = kind
    this.detail = detail
  }
}

/**
 * Run fn, failing if it takes longer than ms (async hangs only; a sync hang blocks the timer)
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {Record<string, any>} detail - Evidence for the failure
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, detail) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new PropertyFailure(`hangs (> ${ms}ms)`, detail)), ms)
  })
  return /** @type {Promise<T>} */ (Promise.race([promise, timeout])).finally(() => clearTimeout(timer))
}

module.exports = { fc, fuzzParams, resolveBoth, isCrash, describe, PropertyFailure, withTimeout }
