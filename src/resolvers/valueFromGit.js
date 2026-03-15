/* from https://github.com/jacob-meacham/serverless-plugin-git-variables/blob/develop/src/index.js */
const os = require('os')
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const GitUrlParse = require('git-url-parse')
const { functionRegex } = require('../utils/regex')
const formatFunctionArgs = require('../utils/strings/formatFunctionArgs')
const { findProjectRoot } = require('../utils/paths/findProjectRoot')
const GIT_PREFIX = 'git'
const gitVariableSyntax = RegExp(/^git:/g)

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

function createResolver(cwd) {
  async function _getValueFromGit(variableString) {
    const variable = variableString.split(`${GIT_PREFIX}:`)[1]
    let value = null
    // console.log('createResolver variableString', variableString)

    // If we're not inside a git repository, every git: variable resolves to
    // undefined. This lets fallbacks like `${git:branch, "main"}` work, and
    // when there's no fallback the outer resolver throws a clear "Unable to
    // resolve config variable" error pointing at the config path.
    if (!isGitRepo(cwd)) {
      return undefined
    }

    if (variable.match(/^remote/i)) {
      const hasParams = functionRegex.exec(variableString)
      const remoteName = (hasParams && hasParams[2]) ? formatFunctionArgs(hasParams[2]) : 'origin'
      return _safeGit(() => getGitRemote(remoteName))
    }

    const normalizedVar = (variable || '').toLowerCase()
    // console.log('normalizedVar', normalizedVar)

    const argsMatch = (variable || '').match(/(.*)\((.*)\)/)
    // console.log('argsMatch', argsMatch)
    if (argsMatch) {
      const funcName = argsMatch[1]
      const args = argsMatch[2]
      if (funcName === 'timestamp' && args) {
        value = await getGitTimestamp(args, cwd, false)
      }
    }

    switch (normalizedVar) {
      // Repo owner/name
      case GIT_KEYS.repo:
      case 'repository':
      case 'reposlug':
      case 'repo-slug': {
        const urla = await _safeGit(() => getGitRemote())
        if (!urla) return undefined
        const parseda = GitUrlParse(urla)
        value = parseda.full_name
        break
      }
      // Repo name
      case GIT_KEYS.name:
      case 'reponame': // repoName
      case 'repo-name': {
        const toplevel = await _safeGit(() => _execFile('git', ['rev-parse', '--show-toplevel']))
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
        const url = await _safeGit(() => getGitRemote())
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
        const gitBasePath = await _safeGit(() => _execFile('git', ['rev-parse', '--show-toplevel']))
        if (!gitBasePath) return undefined
        if (cwd) {
          const subPath = cwd.replace(gitBasePath, '')
          const branch = await _safeGit(() => _execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD']))
          const url = await _safeGit(() => getGitRemote())
          if (!url) return undefined
          value = (subPath && branch) ? `${url}/tree/${branch}${subPath}` : url
        }
        break
      }
      // Repo url
      case GIT_KEYS.url:
      case 'repourl': // repoUrl
      case 'repo-url':
        value = await _safeGit(() => getGitRemote())
        break
      // Current commit sha
      case 'sha':
      case 'sha1':
        value = await _safeGit(() => _execFile('git', ['rev-parse', '--short', 'HEAD']))
        break
      // Current commit full sha
      case GIT_KEYS.commit:
      case 'commitsha':
      case 'commit-sha':
      case 'commithash':
      case 'commit-hash':
        value = await _safeGit(() => _execFile('git', ['rev-parse', 'HEAD']))
        break
      // Branches
      case GIT_KEYS.branch:
      case 'branchname':
      case 'branch-name':
      case 'currentbranch': // currentBranch
      case 'current-branch':
        value = await _safeGit(() => _execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD']))
        break
      // Commit msg
      case GIT_KEYS.message:
      case 'msg':
      case 'commitmessage': // commitMessage
      case 'commit-message':
      case 'commitmsg': // commitMsg
      case 'commit-msg':
        value = await _safeGit(() => _execFile('git', ['log', '-1', '--pretty=%B']))
        break
      // Git tags
      case GIT_KEYS.tag:
      case 'describe':
        value = await _safeGit(() => _execFile('git', ['describe', '--always']))
        break
      // Git tags
      case 'describeLight':
      case 'describelight':
      case 'describe-light':
        value = await _safeGit(() => _execFile('git', ['describe', '--always', '--tags']))
        break
      // Is branch dirty
      case 'isDirty':
      case 'isdirty':
      case 'is-dirty': {
        const writeTree = await _safeGit(() => _execFile('git', ['write-tree']))
        if (!writeTree) return undefined
        const changes = await _safeGit(() => _execFile('git', ['diff-index', writeTree.trim(), '--']))
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

const cache = new Map()

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

  const cachedTimestamp = cache.get(file)
  if (cachedTimestamp) return cachedTimestamp

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
    cache.set(file, dateString)
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
      cache.set(file, dateString)
      return dateString
    } catch (err) {
      if (throwOnMissing) {
        throw new Error(`File ${file} does not exist in Git`)
      }
      return undefined
    }
  }
}

const remoteCache = new Map()

async function getGitRemote(name = 'origin') {
  if (remoteCache.has(name)) {
    return remoteCache.get(name)
  }
  const remoteValues = await _execFile('git', ['remote', '-v'])
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
  const parsed = GitUrlParse(originUrl)
  // @TODO use parsed data for additonal values.
  // @TODO finish git api
  // console.log('parsed', parsed)
  if (parsed && parsed.source && parsed.full_name) {
    const result = `https://${parsed.source}/${parsed.full_name}`
    remoteCache.set(name, result)
    return result
  }
}

module.exports = function createGitResolver(cwd) {
  return {
    type: 'git',
    source: 'readonly',
    prefix: 'git',
    syntax: '${git:valueType}',
    description: `Resolves Git variables. Available valueTypes: ${Object.values(GIT_KEYS).join(', ')}`,
    match: gitVariableSyntax,
    resolver: createResolver(cwd)
  }
}
