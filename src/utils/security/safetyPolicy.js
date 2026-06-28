const fs = require('fs')
const path = require('path')
const { ConfigoramaError } = require('../../errors')

const EXECUTABLE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.esm', '.ts', '.tsx', '.mts', '.cts'])

function asArray(value) {
  if (value === undefined || value === null || value === false) return []
  return Array.isArray(value) ? value : [value]
}

function resolveRoot(root, baseDir) {
  if (!root) return null
  return path.resolve(baseDir || process.cwd(), String(root))
}

function normalizeSafetyPolicy(settings = {}, context = {}) {
  const configDir = context.configDir || settings.configDir || process.cwd()
  const safeMode = settings.safeMode === true || settings.safe === true
  const restrictFileRoots = settings.restrictFileRoots === true || safeMode
  const configuredRoots = asArray(settings.allowedFileRoots || settings.fileRoots || settings.safeRoots)
  const roots = configuredRoots.length
    ? configuredRoots.map(root => resolveRoot(root, configDir)).filter(Boolean)
    : (restrictFileRoots ? [path.resolve(configDir)] : [])

  return {
    safeMode,
    blockExecutableFiles: settings.blockExecutableFiles !== false && safeMode,
    blockCustomResolvers: settings.blockCustomResolvers !== false && safeMode,
    blockCustomFunctions: settings.blockCustomFunctions !== false && safeMode,
    blockDotEnv: settings.blockDotEnv !== false && safeMode,
    restrictFileRoots,
    allowedFileRoots: roots,
  }
}

function realPathIfExists(value) {
  try {
    return fs.realpathSync(value)
  } catch (error) {
    return path.resolve(value)
  }
}

function isPathInsideRoot(filePath, rootPath) {
  const fileReal = realPathIfExists(filePath)
  const rootReal = realPathIfExists(rootPath)
  const relative = path.relative(rootReal, fileReal)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function checkFileAccess(filePath, policy, context = {}) {
  const ext = path.extname(filePath).toLowerCase()
  if (policy.blockExecutableFiles && EXECUTABLE_EXTENSIONS.has(ext)) {
    throw new ConfigoramaError('blocked_by_safe_mode', `Blocked executable config reference in safe mode: ${filePath}`, {
      surface: 'executable_file',
      filePath,
      variable: context.variableString,
    })
  }

  if (policy.restrictFileRoots && policy.allowedFileRoots.length) {
    const allowed = policy.allowedFileRoots.some(root => isPathInsideRoot(filePath, root))
    if (!allowed) {
      throw new ConfigoramaError('file_root_forbidden', `File reference is outside allowed roots: ${filePath}`, {
        filePath,
        allowedRoots: policy.allowedFileRoots,
        variable: context.variableString,
      })
    }
  }
}

function assertSafeConfigInput(filePath, policy) {
  if (!filePath || !policy.safeMode) return
  const ext = path.extname(filePath).toLowerCase()
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    throw new ConfigoramaError('blocked_by_safe_mode', `Blocked executable config file in safe mode: ${filePath}`, {
      surface: 'executable_config',
      filePath,
    })
  }
}

function assertCustomResolversAllowed(variableSources, policy) {
  if (policy.blockCustomResolvers && Array.isArray(variableSources) && variableSources.length > 0) {
    throw new ConfigoramaError('blocked_by_safe_mode', 'Custom variable resolvers are blocked in safe mode', {
      surface: 'custom_resolver',
      count: variableSources.length,
    })
  }
}

function assertCustomFunctionsAllowed(functions, policy) {
  if (policy.blockCustomFunctions && functions && Object.keys(functions).length > 0) {
    throw new ConfigoramaError('blocked_by_safe_mode', 'Custom functions are blocked in safe mode', {
      surface: 'custom_function',
      names: Object.keys(functions).sort(),
    })
  }
}

module.exports = {
  EXECUTABLE_EXTENSIONS,
  assertCustomFunctionsAllowed,
  assertCustomResolversAllowed,
  assertSafeConfigInput,
  checkFileAccess,
  normalizeSafetyPolicy,
}
