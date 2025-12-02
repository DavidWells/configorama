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
    if (variable.match(/^remote/i)) {
      const hasParams = functionRegex.exec(variableString)
      const remoteName = (hasParams && hasParams[2]) ? formatFunctionArgs(hasParams[2]) : 'origin'
      value = await getGitRemote(remoteName)
      return value
    }

    const verifyMsg = `Verify the cwd has a .git directory\n`
    const normalizedVar = (variable || '').toLowerCase()
    // console.log('normalizedVar', normalizedVar)

    const argsMatch = (variable || '').match(/(.*)\((.*)\)/)
    // console.log('argsMatch', argsMatch)
    if (argsMatch) {
      const funcName = argsMatch[1]
      const args = argsMatch[2]
      if (funcName === 'timestamp' && args) {
        value = await getGitTimestamp(args, cwd)
      }
    }

    switch (normalizedVar) {
      // Repo owner/name
      case GIT_KEYS.repo:
      case 'repository':
      case 'reposlug':
      case 'repo-slug':
        const urla = await getGitRemote()
        const parseda = GitUrlParse(urla)
        value = parseda.full_name
        break;
      // Repo name
      case GIT_KEYS.name:
      case 'reponame': // repoName
      case 'repo-name':
        value = await _exec('basename `git rev-parse --show-toplevel`')
        break;
      // Repo org or owner
      case GIT_KEYS.org:
      case 'owner':
      case 'organization':
      case 'repoowner': // repoOwner
      case 'repo-owner':
        const url = await getGitRemote()
        const parsed = GitUrlParse(url)
        value = parsed.organization || parsed.owner
        break;
      // Repo name
      case GIT_KEYS.dir:
      case 'directory':
      case 'dirpath': // dirPath
      case 'dir-path':
      case 'dir_path':
        const gitBasePath = await _exec('git rev-parse --show-toplevel')
        if (cwd) {
          const subPath = cwd.replace(gitBasePath, '')
          const branch = await _exec('git rev-parse --abbrev-ref HEAD')
          const url = await getGitRemote()
          value = (subPath) ? `${url}/tree/${branch}${subPath}` : url
        }
        break;
      // Repo url
      case GIT_KEYS.url:
      case 'repourl': // repoUrl
      case 'repo-url':
        value = await getGitRemote()
        break;
      // Current commit sha
      case 'sha':
      case 'sha1':
        try {
          value = await _exec('git rev-parse --short HEAD')
        } catch (err) {
          throw new Error(`\${git:sha1} error ${verifyMsg}`)
        }
        break
      // Current commit full sha
      case GIT_KEYS.commit:
      case 'commitsha':
      case 'commit-sha':
      case 'commithash':
      case 'commit-hash':
        try {
          value = await _exec('git rev-parse HEAD')
        } catch (err) {
          throw new Error(`\${git:commit} error. ${verifyMsg}`)
        }
        break
      // Branches
      case GIT_KEYS.branch:
      case 'branchname':
      case 'branch-name':
      case 'currentbranch': // currentBranch
      case 'current-branch':
        try {
          value = await _exec('git rev-parse --abbrev-ref HEAD')
        } catch (err) {
          throw new Error(`\${git:branch} error. ${verifyMsg}`)
        }
        break
      // Commit msg
      case GIT_KEYS.message:
      case 'msg':
      case 'commitmessage': // commitMessage
      case 'commit-message':
      case 'commitmsg': // commitMsg
      case 'commit-msg':
        try {
          value = await _exec('git log -1 --pretty=%B')
        } catch (err) {
          throw new Error(`\${git:message} error. ${verifyMsg}`)
        }
        break;
      // Git tags
      case GIT_KEYS.tag:
      case 'describe':
        try {
          value = await _exec('git describe --always')
        } catch (err) {
          throw new Error(`\${git:describeLight} error. ${verifyMsg}`)
        }
        break;
      // Git tags
      case 'describeLight':
      case 'describelight':
      case 'describe-light':
        try {
          value = await _exec('git describe --always --tags')
        } catch (err) {
          throw new Error(`\${git:describeLight} error. ${verifyMsg}`)
        }
        break;
      // Is branch dirty
      case 'isDirty':
      case 'isdirty':
      case 'is-dirty':
        const writeTree = await _exec('git write-tree')
        const changes = await _exec(`git diff-index ${writeTree} --`)
        value = `${changes.length > 0}`
        break
      default:
        if (!value) {
          throw new Error(`Git variable ${variable} is unknown. Candidates are 'describe', 'describeLight', 'sha1', 'commit', 'branch', 'message', 'repository'`)
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

  // Check for suspicious characters and patterns that could be used for command injection or path traversal
  const dangerousPatterns = [
    /[;&|`$]/,  // Command injection chars
    // /\.\.\//,   // Directory traversal
    // /\.\./,     // Directory traversal
    // /^[\/\\]/,  // Absolute paths
    /[\x00-\x1f\x7f-\x9f]/  // Control characters
  ]

  if (dangerousPatterns.some(pattern => pattern.test(_file))) {
    throw new Error('Invalid characters or pattern in file path')
  }

  // Only allow alphanumeric chars, dashes, underscores, forward slashes, and dots
  if (!/^[a-zA-Z0-9-_./\\'"]+$/.test(_file)) {
    throw new Error('File path contains invalid characters')
  }

  // Normalize path and remove leading slash
  const file = _file
    .replace(/^\//, '')

  const cachedTimestamp = cache.get(file)
  if (cachedTimestamp) return cachedTimestamp

  if (!fs.existsSync(cwd)) {
    if (throwOnMissing) {
      throw new Error(`Directory ${cwd} does not exist`)
    }
    return undefined
  }

  try {
    const cmd = `git log -1 --pretty="%ai" ${file}`
    // console.log('cmd', cmd)
    // console.log('cwd', cwd)
    const output = await _exec(cmd, { cwd })
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
      const backupFile = path.join(projectRoot, _file)
      const output = await _exec(`git log -1 --pretty="%ai" ${backupFile}`, { cwd: projectRoot })
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

async function getGitRemote(name = 'origin') {
  const remoteValues = await _exec('git remote -v')
  const remotes = remoteValues.toString().split(os.EOL)
    .filter(function filterOnlyFetchRows(remote) {
      return remote.match('(fetch)')
    })
    .map(function mapRemoteLineToObject(remote) {
      var parts = remote.split('\t')
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
    return
  }
  // console.log('originUrl', originUrl)
  const parsed = GitUrlParse(originUrl)
  // @TODO use parsed data for additonal values.
  // @TODO finish git api
  // console.log('parsed', parsed)
  if (parsed && parsed.source && parsed.full_name) {
    return `https://${parsed.source}/${parsed.full_name}`
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
