/* eslint-disable no-template-curly-in-string */
// Tests for git: overrides (the `overrides` setting / CONFIGORAMA_OVERRIDES env) through the git
// resolver's override hook: no .git or git exec needed, aliases + derived keys, url credentials stripped.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')
const configorama = require('../../src')

const FULL_SHA = '0123456789abcdef0123456789abcdef01234567'
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98'

// Temp dir outside the configorama repo, so findProjectRoot finds no .git
const noRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-git-override-'))
const inRepoConfig = path.join(__dirname, 'gitOverridesInRepo.yml')

/**
 * Write a yml config into a directory and return its path
 * @param {string} dir
 * @param {string} name
 * @param {string[]} lines
 * @returns {string}
 */
function writeConfig(dir, name, lines) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

/**
 * Build an overrides map from short git keys: { commit } -> { 'git:commit' }
 * @param {Record<string, string>} values
 * @returns {Record<string, string>}
 */
function git(values) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of Object.entries(values)) out[`git:${key}`] = value
  return out
}

function clearEnv() {
  delete process.env.CONFIGORAMA_OVERRIDES
}

test.before(() => {
  fs.writeFileSync(inRepoConfig, [
    'commit: ${git:commit}',
    'branch: ${git:branch}',
    'url: ${git:url}',
    '',
  ].join('\n'))
})
test.before.each(clearEnv)
test.after.each(clearEnv)
test.after(() => {
  try { fs.rmSync(inRepoConfig, { force: true }) } catch (e) { /* ignore */ }
  try { fs.rmSync(noRepoRoot, { recursive: true, force: true }) } catch (e) { /* ignore */ }
})

test('override wins inside a real git repo', async () => {
  const config = await configorama(inRepoConfig, {
    overrides: git({ commit: FULL_SHA, url: 'https://github.com/acme/widgets' }),
  })
  assert.is(config.commit, FULL_SHA)
  assert.is(config.url, 'https://github.com/acme/widgets')
})

test('partial override: unsupplied keys still resolve from live git inside a repo', async () => {
  const liveBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname }).toString().trim()
  const config = await configorama(inRepoConfig, { overrides: git({ commit: FULL_SHA }) })
  assert.is(config.commit, FULL_SHA)
  assert.is(config.branch, liveBranch)
  assert.is(config.url, 'https://github.com/DavidWells/configorama')
})

test('override works with no .git anywhere, including aliases', async () => {
  const file = writeConfig(noRepoRoot, 'no-repo.yml', [
    'commit: ${git:commit}',
    'commitSha: ${git:commitSha}',
    'url: ${git:url}',
    'repoUrl: ${git:repoUrl}',
    'branch: ${git:branch}',
    'currentBranch: ${git:currentBranch}',
    'tag: ${git:tag}',
    'describe: ${git:describe}',
    'message: ${git:message}',
  ])
  const config = await configorama(file, {
    overrides: git({
      commit: FULL_SHA,
      url: 'https://github.com/acme/widgets',
      branch: 'main',
      tag: 'v1.2.3',
      message: 'ship it',
    }),
  })
  assert.is(config.commit, FULL_SHA)
  assert.is(config.commitSha, FULL_SHA)
  assert.is(config.url, 'https://github.com/acme/widgets')
  assert.is(config.repoUrl, 'https://github.com/acme/widgets')
  assert.is(config.branch, 'main')
  assert.is(config.currentBranch, 'main')
  assert.is(config.tag, 'v1.2.3')
  assert.is(config.describe, 'v1.2.3')
  assert.is(config.message, 'ship it')
})

test('an alias key in the overrides map supplies its canonical value', async () => {
  const file = writeConfig(noRepoRoot, 'alias-key.yml', ['commit: ${git:commit}'])
  const config = await configorama(file, { overrides: { 'git:commitSha': FULL_SHA } })
  assert.is(config.commit, FULL_SHA)
})

test('partial override with no repo: unsupplied key uses its fallback', async () => {
  const file = writeConfig(noRepoRoot, 'partial-no-repo.yml', [
    'commit: ${git:commit}',
    "branch: ${git:branch, 'fallback-branch'}",
  ])
  const config = await configorama(file, { overrides: git({ commit: FULL_SHA }) })
  assert.is(config.commit, FULL_SHA)
  assert.is(config.branch, 'fallback-branch')
})

test('required git var with no repo and no override still throws', async () => {
  const file = writeConfig(noRepoRoot, 'required-no-repo.yml', ['commit: ${git:commit}'])
  let error
  try {
    await configorama(file)
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an unresolved-variable error')
  assert.match(String(error.message), /git:commit/)
})

test('url override is normalised like a live git remote (ssh, https, .git suffix)', async () => {
  const file = writeConfig(noRepoRoot, 'url-forms.yml', ['url: ${git:url}'])
  const forms = [
    'git@github.com:acme/widgets.git',
    'ssh://git@github.com/acme/widgets.git',
    'https://github.com/acme/widgets.git',
    'https://github.com/acme/widgets',
  ]
  for (const url of forms) {
    const config = await configorama(file, { overrides: git({ url }) })
    assert.is(config.url, 'https://github.com/acme/widgets', `form: ${url}`)
  }
})

test('url override strips credentials from a token-bearing URL (url + remote)', async () => {
  const file = writeConfig(noRepoRoot, 'url-token.yml', [
    'url: ${git:url}',
    'remote: ${git:remote}',
    "remoteOrigin: ${git:remote('origin')}",
  ])
  const config = await configorama(file, {
    overrides: git({ url: 'https://x-access-token:ghs_secretToken123@github.com/acme/widgets.git' }),
  })
  assert.is(config.url, 'https://github.com/acme/widgets')
  assert.is(config.remote, 'https://github.com/acme/widgets')
  assert.is(config.remoteOrigin, 'https://github.com/acme/widgets')
  assert.not.match(JSON.stringify(config), /ghs_secretToken123|x-access-token/)
})

test('an unparseable url override throws a clear error that does not echo the value', async () => {
  const file = writeConfig(noRepoRoot, 'url-bad.yml', ['url: ${git:url}'])
  let error
  try {
    await configorama(file, { overrides: git({ url: 'not a url' }) })
  } catch (err) {
    error = err
  }
  assert.ok(error, 'expected an error for an unparseable url override')
  assert.match(String(error.message), /git url override/i)
  assert.not.match(String(error.message), /not a url/)
})

test('derived keys come from overrides: sha from commit, repo/org/name from url', async () => {
  const file = writeConfig(noRepoRoot, 'derived.yml', [
    'sha: ${git:sha}',
    'sha1: ${git:sha1}',
    'repo: ${git:repo}',
    'repository: ${git:repository}',
    'org: ${git:org}',
    'owner: ${git:owner}',
    'name: ${git:name}',
    'repoName: ${git:repoName}',
  ])
  const config = await configorama(file, {
    overrides: git({ commit: FULL_SHA, url: 'git@github.com:acme/widgets.git' }),
  })
  assert.is(config.sha, FULL_SHA.slice(0, 7))
  assert.is(config.sha1, FULL_SHA.slice(0, 7))
  assert.is(config.repo, 'acme/widgets')
  assert.is(config.repository, 'acme/widgets')
  assert.is(config.org, 'acme')
  assert.is(config.owner, 'acme')
  assert.is(config.name, 'widgets')
  assert.is(config.repoName, 'widgets')
})

test('explicit derived-key overrides beat derivation', async () => {
  const file = writeConfig(noRepoRoot, 'explicit-derived.yml', [
    'sha: ${git:sha}',
    'repo: ${git:repo}',
    'org: ${git:org}',
    'name: ${git:name}',
  ])
  const config = await configorama(file, {
    overrides: git({
      commit: FULL_SHA,
      sha: 'abc1234',
      url: 'https://github.com/acme/widgets',
      repo: 'other/thing',
      org: 'other',
      name: 'thing',
    }),
  })
  assert.is(config.sha, 'abc1234')
  assert.is(config.repo, 'other/thing')
  assert.is(config.org, 'other')
  assert.is(config.name, 'thing')
})

test('CONFIGORAMA_OVERRIDES env resolves git values with no repo', async () => {
  const file = writeConfig(noRepoRoot, 'env.yml', [
    'commit: ${git:commit}',
    'url: ${git:url}',
    'sha: ${git:sha}',
  ])
  process.env.CONFIGORAMA_OVERRIDES = JSON.stringify(git({
    commit: FULL_SHA,
    url: 'https://x-access-token:tok@github.com/acme/widgets.git',
  }))
  const config = await configorama(file)
  assert.is(config.commit, FULL_SHA)
  assert.is(config.url, 'https://github.com/acme/widgets')
  assert.is(config.sha, FULL_SHA.slice(0, 7))
})

test('precedence: env overrides beat live git inside a repo', async () => {
  process.env.CONFIGORAMA_OVERRIDES = JSON.stringify(git({ commit: OTHER_SHA }))
  const config = await configorama(inRepoConfig)
  assert.is(config.commit, OTHER_SHA)
})

test('sync API honours overrides from the setting and the env', () => {
  const file = writeConfig(noRepoRoot, 'sync.yml', [
    'commit: ${git:commit}',
    'url: ${git:url}',
  ])
  const fromSetting = configorama.sync(file, { overrides: git({ commit: FULL_SHA, url: 'https://github.com/acme/widgets' }) })
  assert.is(fromSetting.commit, FULL_SHA)
  assert.is(fromSetting.url, 'https://github.com/acme/widgets')

  process.env.CONFIGORAMA_OVERRIDES = JSON.stringify(git({ commit: OTHER_SHA, url: 'https://github.com/acme/widgets' }))
  const fromEnv = configorama.sync(file)
  assert.is(fromEnv.commit, OTHER_SHA)
})

test.run()
