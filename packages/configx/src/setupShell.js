const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const minimist = require('minimist')

const START_MARKER = '# >>> configx shell integration >>>'
const END_MARKER = '# <<< configx shell integration <<<'
const DEFAULT_FUNCTION_NAME = 'config-env'
const LONG_ALIAS_NAME = 'configx-env'
const FUNCTION_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/

class SetupShellError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message)
    this.name = 'SetupShellError'
    this.code = code
    this.exitCode = exitCode
  }
}

function shellFromEnv(env = process.env) {
  if (!env.SHELL) return ''
  return path.basename(env.SHELL)
}

function normalizeShell(shell) {
  if (!shell) return ''
  const name = path.basename(String(shell)).toLowerCase()
  if (name === 'zsh' || name === 'bash') return name
  return ''
}

function defaultRcFile(shell, home = os.homedir()) {
  if (shell === 'zsh') return path.join(home, '.zshrc')
  if (shell === 'bash') return path.join(home, '.bashrc')
  return ''
}

function validateFunctionName(name) {
  if (!FUNCTION_NAME_PATTERN.test(name)) {
    throw new SetupShellError(
      'setup_shell_invalid_function_name',
      `invalid shell function name "${name}" (must match ${FUNCTION_NAME_PATTERN})`
    )
  }
}

// Capture exports first so a configx failure propagates its exit status;
// a bare eval "$(configx ...)" would swallow it and return 0.
const EVAL_BODY_LINES = [
  '  local __configx_exports',
  '  __configx_exports="$(configx "$@" --export)" || return $?',
  '  eval "$__configx_exports"',
]

function functionBody(functionName = DEFAULT_FUNCTION_NAME, includeLongAlias = true) {
  validateFunctionName(functionName)

  const lines = [START_MARKER]
  if (includeLongAlias || functionName === LONG_ALIAS_NAME) {
    lines.push(`${LONG_ALIAS_NAME}() {`)
    lines.push(...EVAL_BODY_LINES)
    lines.push('}')
    if (functionName !== LONG_ALIAS_NAME) {
      lines.push('')
      lines.push(`${functionName}() {`)
      lines.push(`  ${LONG_ALIAS_NAME} "$@"`)
      lines.push('}')
    }
  } else {
    lines.push(`${functionName}() {`)
    lines.push(...EVAL_BODY_LINES)
    lines.push('}')
  }
  lines.push(END_MARKER)
  return lines.join('\n')
}

function findManagedBlocks(content) {
  const ranges = []
  let searchFrom = 0
  while (true) {
    const start = content.indexOf(START_MARKER, searchFrom)
    if (start === -1) break
    const endMarkerStart = content.indexOf(END_MARKER, start + START_MARKER.length)
    if (endMarkerStart === -1) {
      ranges.push({ start, end: -1 })
      break
    }
    ranges.push({ start, end: endMarkerStart + END_MARKER.length })
    searchFrom = endMarkerStart + END_MARKER.length
  }
  return ranges
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`
}

function installBlock(existing, block) {
  const ranges = findManagedBlocks(existing)
  if (ranges.some((range) => range.end === -1) || ranges.length > 1) {
    throw new SetupShellError(
      'setup_shell_conflict',
      'found multiple or incomplete configx shell integration blocks; please clean them up manually',
      1
    )
  }

  if (ranges.length === 1) {
    const range = ranges[0]
    return ensureTrailingNewline(`${existing.slice(0, range.start)}${block}${existing.slice(range.end)}`)
  }

  const prefix = existing.length && !existing.endsWith('\n') ? '\n\n' : existing.length ? '\n' : ''
  return ensureTrailingNewline(`${existing}${prefix}${block}`)
}

function uninstallBlock(existing) {
  const ranges = findManagedBlocks(existing)
  if (ranges.length === 0) return { changed: false, content: existing }
  if (ranges.some((range) => range.end === -1) || ranges.length > 1) {
    throw new SetupShellError(
      'setup_shell_conflict',
      'found multiple or incomplete configx shell integration blocks; please clean them up manually',
      1
    )
  }

  const range = ranges[0]
  let before = existing.slice(0, range.start)
  let after = existing.slice(range.end)
  if (before.endsWith('\n\n') && after.startsWith('\n')) after = after.slice(1)
  else if (before.endsWith('\n') && after.startsWith('\n')) after = after.slice(1)
  return { changed: true, content: ensureTrailingNewline(before + after) }
}

function readFileIfExists(file) {
  if (!fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf8')
}

function writeRcFile(file, content) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, content)
}

function promptYesNo(question, input = process.stdin, output = process.stderr) {
  const rl = readline.createInterface({ input, output })
  return new Promise((resolve) => {
    rl.question(`${question} [Y/n] `, (answer) => {
      rl.close()
      const normalized = String(answer || '').trim().toLowerCase()
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes')
    })
  })
}

function parseSetupArgs(args) {
  return minimist(args, {
    boolean: ['print', 'install', 'yes', 'uninstall', 'long-alias'],
    string: ['shell', 'rc-file', 'function-name'],
    default: { 'long-alias': true },
  })
}

async function runSetupShell(args, io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const stdin = io.stdin || process.stdin
  const env = io.env || process.env
  const argv = parseSetupArgs(args)

  const shell = normalizeShell(argv.shell || shellFromEnv(env))
  if (!shell) {
    throw new SetupShellError(
      'unsupported_shell',
      'could not detect a supported shell. Use --shell zsh or --shell bash.'
    )
  }

  const rcFile = argv['rc-file'] ? path.resolve(argv['rc-file']) : defaultRcFile(shell)
  if (!rcFile) {
    throw new SetupShellError('setup_shell_invalid_rc_file', `could not choose a startup file for shell ${shell}`)
  }

  const functionName = argv['function-name'] || DEFAULT_FUNCTION_NAME
  const includeLongAlias = argv['long-alias'] !== false
  const block = functionBody(functionName, includeLongAlias)
  const isTty = Boolean(stdin.isTTY && stdout.isTTY)
  const printOnly = argv.print || (!argv.install && !argv.uninstall && !isTty)

  if (printOnly) {
    stdout.write(`${block}\n`)
    return 0
  }

  if (argv.uninstall) {
    if (!argv.yes && isTty && !argv.install) {
      stderr.write(`configx: shell startup file: ${rcFile}\n`)
      const ok = await promptYesNo(`Remove configx shell integration from ${rcFile}?`, stdin, stderr)
      if (!ok) {
        stderr.write('configx: cancelled\n')
        return 0
      }
    }
    const existing = readFileIfExists(rcFile)
    const result = uninstallBlock(existing)
    if (!result.changed) {
      stderr.write(`configx: shell integration is not installed in ${rcFile}\n`)
      return 0
    }
    writeRcFile(rcFile, result.content)
    stderr.write(`configx: removed configx shell integration from ${rcFile}\n`)
    return 0
  }

  if (!argv.install && isTty) {
    stderr.write(`configx: detected ${shell}\n`)
    stderr.write(`configx: shell startup file: ${rcFile}\n\n`)
    stderr.write(`This will install the ${functionName} shell function`)
    if (includeLongAlias && functionName !== LONG_ALIAS_NAME) stderr.write(` and ${LONG_ALIAS_NAME} alias`)
    stderr.write(':\n\n')
    stderr.write(`  ${functionName} .env --stage prod\n\n`)
    const ok = await promptYesNo(`Add configx shell integration to ${rcFile}?`, stdin, stderr)
    if (!ok) {
      stderr.write('configx: cancelled\n')
      return 0
    }
  }

  const existing = readFileIfExists(rcFile)
  const next = installBlock(existing, block)
  writeRcFile(rcFile, next)
  stderr.write(`configx: installed configx shell integration in ${rcFile}\n`)
  stderr.write(`configx: restart your shell or run: source ${rcFile}\n`)
  return 0
}

module.exports = {
  START_MARKER,
  END_MARKER,
  DEFAULT_FUNCTION_NAME,
  LONG_ALIAS_NAME,
  FUNCTION_NAME_PATTERN,
  SetupShellError,
  functionBody,
  installBlock,
  uninstallBlock,
  normalizeShell,
  defaultRcFile,
  runSetupShell,
}
