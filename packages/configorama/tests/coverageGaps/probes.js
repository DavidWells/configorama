/*
 * Reproductions from the 2026-09-30 test review, also run by coverageGaps.test.js.
 * Each case runs in a fresh process;
 * multiple resolutions within a case deliberately share caches/worker state.
 * Run: node scripts/test-gap-probes.js [case-name]
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

async function withRepositories(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-test-gaps-'))
  const originalCwd = process.cwd()
  const git = (cwd, args, env = process.env) => execFileSync('git', args, {
    cwd, env, stdio: ['ignore', 'pipe', 'pipe']
  })
  function create(name, date) {
    const repo = path.join(root, name)
    fs.mkdirSync(repo)
    git(repo, ['init', '-b', name])
    git(repo, ['config', 'user.name', 'Configorama test'])
    git(repo, ['config', 'user.email', 'test@example.invalid'])
    git(repo, ['remote', 'add', 'origin', `https://github.com/test/${name}.git`])
    fs.writeFileSync(path.join(repo, 'data.txt'), name)
    git(repo, ['add', 'data.txt'])
    git(repo, ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${root}`, 'commit', '-m', name], {
      ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date
    })
    return repo
  }
  try {
    const alpha = create('alpha', '2020-01-01T00:00:00Z')
    const bravo = create('bravo', '2021-01-01T00:00:00Z')
    await run(require('../../src'), alpha, bravo)
  } finally {
    process.chdir(originalCwd)
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const cases = {
  'git-config-directory': () => withRepositories(async (configorama, alpha, bravo) => {
    process.chdir(alpha)
    const result = await configorama({ name: '${git:name}', branch: '${git:branch}', url: '${git:url}' }, {
      configDir: bravo
    })
    assert.deepEqual(result, { name: 'bravo', branch: 'bravo', url: 'https://github.com/test/bravo' })
  }),
  'git-remote-cache': () => withRepositories(async (configorama, alpha, bravo) => {
    process.chdir(alpha)
    assert.deepEqual(await configorama({ url: '${git:url}' }, { configDir: alpha }), {
      url: 'https://github.com/test/alpha'
    })
    process.chdir(bravo)
    assert.deepEqual(await configorama({ url: '${git:url}' }, { configDir: bravo }), {
      url: 'https://github.com/test/bravo'
    })
    process.chdir(alpha)
    assert.deepEqual(await configorama({ url: '${git:url}' }, { configDir: alpha }), {
      url: 'https://github.com/test/alpha'
    })
  }),
  'git-timestamp-cache': () => withRepositories(async (configorama, alpha, bravo) => {
    const input = { stamp: "${git:timestamp('data.txt')}" }
    process.chdir(alpha)
    assert.deepEqual(await configorama(input, { configDir: alpha }), { stamp: '2020-01-01T00:00:00.000Z' })
    process.chdir(bravo)
    assert.deepEqual(await configorama(input, { configDir: bravo }), { stamp: '2021-01-01T00:00:00.000Z' })
    process.chdir(alpha)
    assert.deepEqual(await configorama(input, { configDir: alpha }), { stamp: '2020-01-01T00:00:00.000Z' })
  }),
  'git-sync-isolation': () => withRepositories(async (configorama, alpha, bravo) => {
    const input = { url: '${git:url}', stamp: "${git:timestamp('data.txt')}" }
    process.chdir(alpha)
    assert.deepEqual(configorama.sync(input, { configDir: alpha, options: {} }), {
      url: 'https://github.com/test/alpha', stamp: '2020-01-01T00:00:00.000Z'
    })
    process.chdir(bravo)
    assert.deepEqual(configorama.sync(input, { configDir: bravo, options: {} }), {
      url: 'https://github.com/test/bravo', stamp: '2021-01-01T00:00:00.000Z'
    })
    process.chdir(alpha)
    assert.deepEqual(configorama.sync(input, { configDir: alpha, options: {} }), {
      url: 'https://github.com/test/alpha', stamp: '2020-01-01T00:00:00.000Z'
    })
  }),
  'git-refresh-between-loads': () => withRepositories(async (configorama, alpha, bravo) => {
    // Keep the caller in the other repository, including for the sync worker.
    process.chdir(bravo)
    const input = { branch: '${git:branch}', url: '${git:url}', stamp: "${git:timestamp('data.txt')}" }
    const settings = { configDir: alpha, options: {} }
    const before = { branch: 'alpha', url: 'https://github.com/test/alpha', stamp: '2020-01-01T00:00:00.000Z' }
    assert.deepEqual(await configorama(input, settings), before)
    assert.deepEqual(configorama.sync(input, settings), before)
    const git = (args, env = process.env) => execFileSync('git', args, { cwd: alpha, env, stdio: 'pipe' })
    git(['remote', 'set-url', 'origin', 'https://github.com/test/changed.git'])
    git(['checkout', '-b', 'changed'])
    fs.writeFileSync(path.join(alpha, 'data.txt'), 'changed')
    git(['add', 'data.txt'])
    git(['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${path.dirname(alpha)}`, 'commit', '-m', 'changed'], {
      ...process.env, GIT_AUTHOR_DATE: '2022-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2022-01-01T00:00:00Z'
    })
    const after = { branch: 'changed', url: 'https://github.com/test/changed', stamp: '2022-01-01T00:00:00.000Z' }
    assert.deepEqual(await configorama(input, settings), after)
    assert.deepEqual(configorama.sync(input, settings), after)
  }),
  'has-own-property-key': async () => {
    const result = await require('../../src')({ hasOwnProperty: 'data', out: '${opt:v}' }, { options: { v: 'ok' } })
    assert.deepEqual(result, { hasOwnProperty: 'data', out: 'ok' })
  },
  'null-prototype-input': async () => {
    const input = Object.assign(Object.create(null), { value: 'ok', out: '${self:value}' })
    const result = await require('../../src')(input)
    assert.deepEqual(Object.entries(result), [['value', 'ok'], ['out', 'ok']])
  },
  'proto-key-preservation': async () => {
    const input = JSON.parse('{"__proto__":{"hidden":"${opt:v}"},"value":"ok"}')
    const result = await require('../../src')(input, { options: { v: 'resolved' } })
    assert.deepEqual({
      ownKey: Object.prototype.hasOwnProperty.call(result, '__proto__'),
      hidden: result.__proto__.hidden,
      ordinaryPrototype: Object.getPrototypeOf(result) === Object.prototype
    }, { ownKey: true, hidden: 'resolved', ordinaryPrototype: true })
  },
  'special-key-self-references': async () => {
    const configorama = require('../../src')
    const before = Object.getOwnPropertyDescriptors(Object.prototype)
    for (const key of ['__proto__', 'constructor', 'hasOwnProperty', 'prototype', 'toString']) {
      const input = { value: 'ok', [key]: '${self:value}' }
      const expected = { value: 'ok', [key]: 'ok' }
      assert.deepEqual(await configorama(input), expected)
      assert.deepEqual(configorama.sync(input, { options: {} }), expected)
      const metadataResult = await configorama(input, { returnMetadata: true })
      assert.deepEqual(metadataResult.config, expected)
      assert.deepEqual(metadataResult.originalConfig, input)
    }
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before)
  },
  'special-key-file-inputs': async () => {
    const configorama = require('../../src')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-dictionary-'))
    try {
      const input = JSON.parse('{"value":"ok","data":{"__proto__":{"hidden":"${self:value}"},"hasOwnProperty":"${self:value}"}}')
      const expected = JSON.parse('{"value":"ok","data":{"__proto__":{"hidden":"ok"},"hasOwnProperty":"ok"}}')
      const files = {
        'config.json': JSON.stringify(input),
        'config.yml': 'value: ok\ndata:\n  __proto__:\n    hidden: ${self:value}\n  hasOwnProperty: ${self:value}\n'
      }
      for (const [name, text] of Object.entries(files)) {
        const file = path.join(root, name)
        fs.writeFileSync(file, text)
        assert.deepEqual(await configorama(file), expected)
        assert.deepEqual(configorama.sync(file, { options: {} }), expected)
        const outer = path.join(root, 'outer.yml')
        fs.writeFileSync(outer, `out: \${file(./${name})}\n`)
        assert.deepEqual(await configorama(outer), { out: expected })
        assert.deepEqual(configorama.sync(outer, { options: {} }), { out: expected })
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
  'dotted-key-path-collision': async () => {
    const configorama = require('../../src')
    for (const reverse of [false, true]) {
      const entries = [['a.b', 'literal'], ['a', { b: '${self:alias}' }], ['alias', '${self:value}'], ['value', 'ok']]
      const input = Object.fromEntries(reverse ? entries.reverse() : entries)
      const expected = { 'a.b': 'literal', a: { b: 'ok' }, alias: 'ok', value: 'ok' }
      assert.deepEqual(await configorama(input), expected)
      assert.deepEqual(configorama.sync(input, { options: {} }), expected)
    }
    assert.deepEqual(await configorama({ 'a.b': 'literal', a: { b: '${opt:x}' }, value: 'ok' }, {
      options: { x: '${self:value}' }
    }), { 'a.b': 'literal', a: { b: 'ok' }, value: 'ok' })
    assert.deepEqual(await configorama({ 'a.b': '${self:a}', a: { b: 'ok' } }), {
      'a.b': { b: 'ok' }, a: { b: 'ok' }
    })
  }
}

async function main() {
  if (process.argv[2] === '--case') {
    const run = cases[process.argv[3]]
    assert.ok(run, 'Unknown probe case')
    await run()
    return
  }
  const names = process.argv[2] ? [process.argv[2]] : Object.keys(cases)
  let failures = 0
  for (const name of names) {
    assert.ok(Object.prototype.hasOwnProperty.call(cases, name), `Unknown probe: ${name}`)
    const result = spawnSync(process.execPath, [__filename, '--case', name], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024
    })
    const passed = result.status === 0 && !result.error
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
    if (!passed) {
      failures++
      process.stderr.write(result.stderr || String(result.error || result.signal))
    }
  }
  console.log(`${names.length - failures}/${names.length} probes passed; ${failures} reproduced failures`)
  process.exitCode = failures ? 1 : 0
}

module.exports = { cases, main }
if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
