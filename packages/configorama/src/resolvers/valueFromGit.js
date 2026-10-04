/* from https://github.com/jacob-meacham/serverless-plugin-git-variables/blob/develop/src/index.js */
const os = require('os')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const { functionRegex } = require('../utils/regex')
const formatFunctionArgs = require('../utils/strings/formatFunctionArgs')
const { findProjectRoot } = require('../utils/paths/findProjectRoot')
const GIT_PREFIX = 'git'
const gitVariableSyntax = RegExp(/^git:/g)

/**
 * Parses a git remote URL. git-url-parse is loaded on demand so configs without git refs skip its require cost
 * @param {string} url
 */
function GitUrlParse(url) {
  return require('git-url-parse')(url)
}

/**
 * Check if a directory is inside a git repository.
 * @param {string} [dir] - Directory to check (defaults to process.cwd())
 * @returns {boolean}
 */
function isGitRepo(dir) {
  const start = dir || process.cwd()
  try {
    if (!fs.existsSync(start)) return false
    return findProjectRoot(start) !== null
  } catch (err) {
    return false
  }
}

/**
 * Execute a shell command
 * @param {string} cmd - Command to execute
 * @param {import('child_process').ExecOptions} [options] - Exec options
 * @returns {Promise<string>}
 */
async function _exec(cmd, options = { timeout: 1000 }) {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, options, (err, stdout) => {
      if (err) {
        return reject(err)
      }
      return resolve(String(stdout).trim())
    })
  })
}

/**
 * Execute a command with arguments array (safe from shell injection)
 * @param {string} command - Command to execute
 * @param {string[]} args - Arguments array
 * @param {import('child_process').ExecFileOptions} [options] - ExecFile options
 * @returns {Promise<string>}
 */
async function _execFile(command, args, options = { timeout: 1000 }) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(command, args, options, (err, stdout) => {
      if (err) {
        return reject(err)
      }
      return resolve(String(stdout).trim())
    })
  })
}

/**
 * Run a git command and return undefined on failure. This lets the variable
 * resolver fall through to user-provided fallbacks (e.g. `${git:branch, "main"}`)
 * when not in a git repo, without surfacing raw `fatal: not a git repository`
 * errors. When no fallback is provided, the outer resolver in main.js still
 * produces a clear "Unable to resolve config variable" error pointing at the
 * exact config path.
 *
 * @param {() => Promise<string>} cmdFn - Function that runs the git command
 * @returns {Promise<string|undefined>}
 */
async function _safeGit(cmdFn) {
  try {
    return await cmdFn()
  } catch (err) {
    return undefined
  }
}

// TODO denote computed fields in metadata
/*
{
  variables: {
    repo: {
      value: '${git:repo}',
      type: 'string',
      description: 'The repository owner and name',
    }
  },
  computedVariables : {
    hash: {
      value: '${git:sha1}',
      type: 'string',
      description: 'The current commit hash',
    }
  }
}
*/

const GIT_KEYS = {
  repo: 'repo',
  name: 'name',
  org: 'org',
  dir: 'dir',
  url: 'url',
  sha: 'sha',
  commit: 'commit',
  branch: 'branch',
  message: 'message',
  tag: 'tag',
}

/**
 * @typedef {Object} GitOverrideValues
 * @property {string} [commit] - Full commit sha for ${git:commit}
 * @property {string} [sha] - Short sha for ${git:sha} (derived from commit when absent)
 * @property {string} [branch] - Branch for ${git:branch}
 * @property {string} [url] - Remote URL for ${git:url} / ${git:remote} (normalised, credentials stripped)
 * @property {string} [repo] - owner/name for ${git:repo} (derived from url when absent)
 * @property {string} [org] - Owner for ${git:org} (derived from url when absent)
 * @property {string} [name] - Repo name for ${git:name} (derived from url when absent)
 * @property {string} [tag] - Value for ${git:tag} / ${git:describe}
 * @property {string} [message] - Commit message for ${git:message}
 */

// Lowercased git variable names (and their aliases) that overrides can supply, mapped to their canonical key
const OVERRIDABLE_GIT_KEYS = {
  commit: ['commit', 'commitsha', 'commit-sha', 'commithash', 'commit-hash'],
  sha: ['sha', 'sha1'],
  branch: ['branch', 'branchname', 'branch-name', 'currentbranch', 'current-branch'],
  url: ['url', 'repourl', 'repo-url'],
  repo: ['repo', 'repository', 'reposlug', 'repo-slug'],
  org: ['org', 'owner', 'organization', 'repoowner', 'repo-owner'],
  name: ['name', 'reponame', 'repo-name'],
  message: ['message', 'msg', 'commitmessage', 'commit-message', 'commitmsg', 'commit-msg'],
  tag: ['tag', 'describe'],
}
/** @type {Map<string, keyof GitOverrideValues>} */
const CANONICAL_GIT_KEY = new Map()
for (const [canonical, aliases] of Object.entries(OVERRIDABLE_GIT_KEYS)) {
  for (const alias of aliases) CANONICAL_GIT_KEY.set(alias, /** @type {keyof GitOverrideValues} */ (canonical))
}
// Short sha length used when ${git:sha} is derived from an overridden full commit
const SHORT_SHA_LENGTH = 7

/**
 * Collect the git: entries of the overrides map into canonical git values (aliases folded in)
 * @param {Record<string, any>} overrides - The resolved overrides map, keyed by variable ref
 * @returns {GitOverrideValues}
 */
function gitOverrideValues(overrides) {
  /** @type {GitOverrideValues} */
  const values = {}
  for (const [ref, value] of Object.entries(overrides || {})) {
    if (!ref.startsWith(`${GIT_PREFIX}:`) || value === undefined || value === null) continue
    const canonical = CANONICAL_GIT_KEY.get(ref.slice(GIT_PREFIX.length + 1).trim().toLowerCase())
    if (canonical) values[canonical] = String(value)
  }
  return values
}

/**
 * Normalise a git remote URL to https://<host>/<owner>/<name>, dropping credentials and .git
 * @param {string} url
 * @returns {string|undefined}
 */
function normaliseRemoteUrl(url) {
  const parsed = GitUrlParse(url)
  if (parsed && parsed.source && parsed.full_name) {
    return `https://${parsed.source}/${parsed.full_name}`
  }
}

/**
 * Parse an overridden git url, throwing a clear error that never echoes the value (it may hold a token)
 * @param {string} url
 * @returns {{ url: string, fullName: string, owner: string, name: string }}
 */
function parseUrlOverride(url) {
  let parsed
  try {
    parsed = GitUrlParse(url)
  } catch (err) {
    parsed = undefined
  }
  if (!parsed || !parsed.source || !parsed.full_name) {
    throw new Error('Unable to parse the git url override (overrides["git:url"]). Expected a git remote URL like https://github.com/owner/repo')
  }
  return {
    url: `https://${parsed.source}/${parsed.full_name}`,
    fullName: parsed.full_name,
    owner: parsed.organization || parsed.owner,
    name: parsed.name,
  }
}

/**
 * Value for a canonical git key from override values, deriving sha from commit and repo/org/name from url
 * @param {keyof GitOverrideValues} key
 * @param {GitOverrideValues} values
 * @returns {string|undefined}
 */
function valueFromOverrides(key, values) {
  switch (key) {
    case 'sha':
      if (values.sha) return values.sha
      return values.commit ? values.commit.slice(0, SHORT_SHA_LENGTH) : undefined
    case 'url':
      return values.url ? parseUrlOverride(values.url).url : undefined
    case 'repo':
      if (values.repo) return values.repo
      return values.url ? parseUrlOverride(values.url).fullName : undefined
    case 'org':
      if (values.org) return values.org
      return values.url ? parseUrlOverride(values.url).owner : undefined
    case 'name':
      if (values.name) return values.name
      return values.url ? parseUrlOverride(values.url).name : undefined
    default:
      return values[key]
  }
}

/**
 * Override hook for the git resolver: answers a git: variable from the overrides map (aliases, url
 * normalisation, derived keys) so it resolves without a .git dir or a git exec. Undefined = not covered.
 * @param {string} variableString - e.g. git:commit or git:remote('origin')
 * @param {Record<string, any>} overrides - The resolved overrides map, keyed by variable ref
 * @returns {string|undefined}
 */
function overrideGitValue(variableString, overrides) {
  const values = gitOverrideValues(overrides)
  if (!Object.keys(values).length) return undefined
  const variable = (variableString.split(`${GIT_PREFIX}:`)[1] || '').trim()
  if (variable.match(/^remote/i)) {
    const hasParams = functionRegex.exec(variableString)
    const remoteName = (hasParams && hasParams[2]) ? formatFunctionArgs(hasParams[2]) : 'origin'
    return remoteName === 'origin' ? valueFromOverrides('url', values) : undefined
  }
  const canonical = CANONICAL_GIT_KEY.get(variable.toLowerCase())
  return canonical ? valueFromOverrides(canonical, values) : undefined
}

/**
 * @param {string} [cwd] - Config directory
 */
function createResolver(cwd) {
  // Capture the config directory once. Caches belong to this config load only,
  // so other repositories and subsequent Git changes cannot reuse stale values.
  cwd = path.resolve(cwd || process.cwd())
  let gitRepo
  const gitResultCache = new Map()

  function isCurrentGitRepo() {
    if (typeof gitRepo === 'undefined') {
      gitRepo = isGitRepo(cwd)
    }
    return gitRepo
  }

  function cachedSafeGit(key, cmdFn) {
    if (!gitResultCache.has(key)) {
      gitResultCache.set(key, _safeGit(cmdFn))
    }
    return gitResultCache.get(key)
  }

  function gitExec(args) {
    const key = `git:${JSON.stringify(args)}`
    return cachedSafeGit(key, () => _execFile('git', args, { cwd, timeout: 1000 }))
  }

  function gitRemote(name = 'origin') {
    return cachedSafeGit(`remote:${name}`, () => getGitRemote(name, cwd))
  }

  async function _getValueFromGit(variableString) {
    const variable = variableString.split(`${GIT_PREFIX}:`)[1]
    let value = null
    // console.log('createResolver variableString', variableString)

    // If we're not inside a git repository, every git: variable resolves to
    // undefined. This lets fallbacks like `${git:branch, "main"}` work, and
    // when there's no fallback the outer resolver throws a clear "Unable to
    // resolve config variable" error pointing at the config path.
    if (!isCurrentGitRepo()) {
      return undefined
    }

    if (variable.match(/^remote/i)) {
      const hasParams = functionRegex.exec(variableString)
      const remoteName = (hasParams && hasParams[2]) ? formatFunctionArgs(hasParams[2]) : 'origin'
      return gitRemote(remoteName)
    }

    const normalizedVar = (variable || '').toLowerCase()
    // console.log('normalizedVar', normalizedVar)

    const argsMatch = (variable || '').match(/(.*)\((.*)\)/)
    // console.log('argsMatch', argsMatch)
    if (argsMatch) {
      const funcName = argsMatch[1]
      const args = argsMatch[2]
      if (funcName === 'timestamp' && args) {
        const key = `timestamp:${args}`
        if (!gitResultCache.has(key)) {
          gitResultCache.set(key, getGitTimestamp(args, cwd, false))
        }
        value = await gitResultCache.get(key)
      }
    }

    switch (normalizedVar) {
      // Repo owner/name
      case GIT_KEYS.repo:
      case 'repository':
      case 'reposlug':
      case 'repo-slug': {
        const urla = await gitRemote()
        if (!urla) return undefined
        const parseda = GitUrlParse(urla)
        value = parseda.full_name
        break
      }
      // Repo name
      case GIT_KEYS.name:
      case 'reponame': // repoName
      case 'repo-name': {
        const toplevel = await gitExec(['rev-parse', '--show-toplevel'])
        if (!toplevel) return undefined
        value = path.basename(toplevel)
        break
      }
      // Repo org or owner
      case GIT_KEYS.org:
      case 'owner':
      case 'organization':
      case 'repoowner': // repoOwner
      case 'repo-owner': {
        const url = await gitRemote()
        if (!url) return undefined
        const parsed = GitUrlParse(url)
        value = parsed.organization || parsed.owner
        break
      }
      // Repo name
      case GIT_KEYS.dir:
      case 'directory':
      case 'dirpath': // dirPath
      case 'dir-path':
      case 'dir_path': {
        const gitBasePath = await gitExec(['rev-parse', '--show-toplevel'])
        if (!gitBasePath) return undefined
        if (cwd) {
          const subPath = cwd.replace(gitBasePath, '')
          const branch = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'])
          const url = await gitRemote()
          if (!url) return undefined
          value = (subPath && branch) ? `${url}/tree/${branch}${subPath}` : url
        }
        break
      }
      // Repo url
      case GIT_KEYS.url:
      case 'repourl': // repoUrl
      case 'repo-url':
        value = await gitRemote()
        break
      // Current commit sha
      case 'sha':
      case 'sha1':
        value = await gitExec(['rev-parse', '--short', 'HEAD'])
        break
      // Current commit full sha
      case GIT_KEYS.commit:
      case 'commitsha':
      case 'commit-sha':
      case 'commithash':
      case 'commit-hash':
        value = await gitExec(['rev-parse', 'HEAD'])
        break
      // Branches
      case GIT_KEYS.branch:
      case 'branchname':
      case 'branch-name':
      case 'currentbranch': // currentBranch
      case 'current-branch':
        value = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'])
        break
      // Commit msg
      case GIT_KEYS.message:
      case 'msg':
      case 'commitmessage': // commitMessage
      case 'commit-message':
      case 'commitmsg': // commitMsg
      case 'commit-msg':
        value = await gitExec(['log', '-1', '--pretty=%B'])
        break
      // Git tags
      case GIT_KEYS.tag:
      case 'describe':
        value = await gitExec(['describe', '--always'])
        break
      // Git tags
      case 'describeLight':
      case 'describelight':
      case 'describe-light':
        value = await gitExec(['describe', '--always', '--tags'])
        break
      // Is branch dirty
      case 'isDirty':
      case 'isdirty':
      case 'is-dirty': {
        const writeTree = await gitExec(['write-tree'])
        if (!writeTree) return undefined
        const changes = await gitExec(['diff-index', writeTree.trim(), '--'])
        if (changes === undefined) return undefined
        value = `${changes.length > 0}`
        break
      }
      default:
        if (!value) {
          // Unknown variable name (likely a typo). This is a config error,
          // not an environment one, so throw a helpful message listing the
          // valid keys.
          throw new Error(`Git variable "${variable}" is unknown. Valid options: ${Object.values(GIT_KEYS).join(', ')}`)
        }
    }
    return value
  }
  return _getValueFromGit
}

/**
 * Gets the last Git commit timestamp for a file
 * @param {string} _file - Path to the file to check
 * @param {string} cwd - Working directory
 * @param {boolean} [throwOnMissing] - Whether to throw on missing file
 * @returns {Promise<string|undefined>} The commit timestamp ISO string or undefined if not in Git
 */
async function getGitTimestamp(_file, cwd, throwOnMissing = true) {
  // Validate file path to prevent command injection
  if (typeof _file !== 'string') {
    throw new Error('File path must be a string')
  }

  // Strip surrounding quotes and leading slash
  const file = _file
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\//, '')

  // Reject control characters
  if (/[\x00-\x1f\x7f-\x9f]/.test(file)) {
    throw new Error('File path contains invalid characters')
  }

  if (!fs.existsSync(cwd)) {
    if (throwOnMissing) {
      throw new Error(`Directory ${cwd} does not exist`)
    }
    return undefined
  }

  try {
    const output = await _execFile('git', ['log', '-1', '--pretty=%ai', '--', file], { cwd })
    const date = new Date(output)
    const dateString = date.toISOString()
    return dateString
  } catch (err) {
    const projectRoot = findProjectRoot(cwd)
    if (!projectRoot) {
      if (throwOnMissing) {
        throw new Error(`No Git repository found in ${cwd}`)
      }
      return undefined
    }

    try {
      const backupFile = path.join(projectRoot, file)
      const output = await _execFile('git', ['log', '-1', '--pretty=%ai', '--', backupFile], { cwd: projectRoot })
      const date = new Date(output)
      const dateString = date.toISOString()
      return dateString
    } catch (err) {
      if (throwOnMissing) {
        throw new Error(`File ${file} does not exist in Git`)
      }
      return undefined
    }
  }
}

async function getGitRemote(name, cwd) {
  const remoteValues = await _execFile('git', ['remote', '-v'], { cwd, timeout: 1000 })
  const remotes = remoteValues.toString().split(os.EOL)
    .filter(function filterOnlyFetchRows(remote) {
      return remote.match('(fetch)')
    })
    .map(function mapRemoteLineToObject(remote) {
      const parts = remote.split('\t')
      if (parts.length < 2) {
        return
      }

      return {
        name: parts[0],
        url: parts[1].replace('(fetch)', '').trim()
      }
    })

  const origin = remotes.filter((remote) => {
    return remote.name === name
  })
  const originUrl = origin.reduce((acc, curr) => {
    return curr.url
  }, '')

  if (!originUrl) {
    throw new Error(`No git remote "${name}" found. Please double check your remote names`)
  }
  // console.log('originUrl', originUrl)
  // @TODO use parsed data for additonal values.
  // @TODO finish git api
  return normaliseRemoteUrl(originUrl)
}

/**
 * @param {string} [cwd] - Config directory
 */
module.exports = function createGitResolver(cwd) {
  return {
    type: 'git',
    source: 'readonly',
    prefix: 'git',
    syntax: '${git:valueType}',
    description: `Resolves Git variables. Available valueTypes: ${Object.values(GIT_KEYS).join(', ')}`,
    match: gitVariableSyntax,
    resolver: createResolver(cwd),
    override: overrideGitValue,
  }
}
