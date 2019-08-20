/* from https://github.com/jacob-meacham/serverless-plugin-git-variables/blob/develop/src/index.js */
const os = require('os')
const childProcess = require('child_process')
const GitUrlParse = require('git-url-parse')
const { functionRegex } = require('../utils/regex')
const formatFunctionArgs = require('../utils/formatFunctionArgs')
const GIT_PREFIX = 'git'
const gitVariableSyntax = RegExp(/^git:/g)

async function _exec(cmd, options = { timeout: 1000 }) {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, options, (err, stdout) => {
      if (err) {
        return reject(err)
      }
      return resolve(stdout.trim())
    })
  })
}

async function _getValueFromGit(variableString) {
  const variable = variableString.split(`${GIT_PREFIX}:`)[1]
  let value = null
  // console.log('variableStringvariableString', variableString)
  if (variable.match(/^remote/)) {
    const hasParams = functionRegex.exec(variableString)
    const remoteName = (hasParams && hasParams[2]) ? formatFunctionArgs(hasParams[2]) : 'origin'
    value = await getGitRemote(remoteName)
    return value
  }

  const verifyMsg = `Verify the cwd has a .git directory\n`

  switch (variable) {
    case 'describe':
      try {
        value = await _exec('git describe --always')
      } catch (err) {
        throw new Error(`\${git:describeLight} error. ${verifyMsg}`)
      }
      break
    case 'describeLight':
      try {
        value = await _exec('git describe --always --tags')
      } catch (err) {
        throw new Error(`\${git:describeLight} error. ${verifyMsg}`)
      }
      break
    case 'sha1':
      try {
        value = await _exec('git rev-parse --short HEAD')
      } catch (err) {
        throw new Error(`\${git:sha1} error ${verifyMsg}`)
      }
      break
    case 'commit':
      try {
        value = await _exec('git rev-parse HEAD')
      } catch (err) {
        throw new Error(`\${git:commit} error. ${verifyMsg}`)
      }
      break
    case 'branch':
      try {
        value = await _exec('git rev-parse --abbrev-ref HEAD')
      } catch (err) {
        throw new Error(`\${git:branch} error. ${verifyMsg}`)
      }
      break
    case 'message':
      try {
        value = await _exec('git log -1 --pretty=%B')
      } catch (err) {
        throw new Error(`\${git:message} error. ${verifyMsg}`)
      }
      break
    case 'isDirty':
      const writeTree = await _exec('git write-tree')
      const changes = await _exec(`git diff-index ${writeTree} --`)
      value = `${changes.length > 0}`
      break
    case 'repository':
      value = await _exec('basename `git rev-parse --show-toplevel`')
      break
    case 'url': case 'repoUrl':
      value = await getGitRemote()
      break
    default:
      throw new Error(`Git variable ${variable} is unknown. Candidates are 'describe', 'describeLight', 'sha1', 'commit', 'branch', 'message', 'repository'`)
  }
  return value
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

module.exports = {
  match: gitVariableSyntax,
  resolver: _getValueFromGit
}
