const DEFAULT_IGNORE_PATHS = [
  '**.Fn::Sub',
  '**.Fn::Sub.0',
  '**.Properties.Code.ZipFile',
  '**.Properties.FunctionCode',
  '**.Properties.UserData',
  '**.Properties.BuildSpec',
  '**.Properties.DefinitionString',
  '**.Properties.DefinitionBody',
  '**.Properties.RequestMappingTemplate',
  '**.Properties.ResponseMappingTemplate',
  '**.Properties.RequestTemplates.*',
  '**.Properties.ResponseTemplates.*',
  '**.Metadata.AWS::CloudFormation::Init.*.files.*.content',
  '**.Metadata.AWS::CloudFormation::Init.*.commands.*.command'
]

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function pathToSegments(pathValue) {
  if (!pathValue) return []
  return Array.isArray(pathValue) ? pathValue.map(String) : String(pathValue).split('.')
}

function patternToSegments(pattern) {
  return String(pattern).split('.')
}

function matchSegments(patternSegments, pathSegments) {
  return matchFrom(patternSegments, 0, pathSegments, 0)
}

// Index-based glob match: '**' spans zero-or-more segments (with backtracking),
// '*' matches one segment, anything else matches literally. Avoids per-call array
// allocation (no destructuring/slice) that dominated resolution hot paths.
function matchFrom(pattern, pi, path, si) {
  while (pi < pattern.length) {
    const head = pattern[pi]
    if (head === '**') {
      // '**' consumes zero segments here...
      if (matchFrom(pattern, pi + 1, path, si)) return true
      // ...or one more path segment, still anchored on '**'
      if (si >= path.length) return false
      si++
      continue
    }
    if (si >= path.length) return false
    if (head !== '*' && head !== path[si]) return false
    pi++
    si++
  }
  return si === path.length
}

function normalizeIgnorePaths(options = {}) {
  const defaults = options.disableDefaultIgnorePaths ? [] : DEFAULT_IGNORE_PATHS
  return Array.from(new Set([
    ...defaults,
    ...toArray(options.ignorePaths),
    ...toArray(options.skipResolutionPaths)
  ]))
}

function compileIgnorePaths(patterns) {
  return toArray(patterns).map(patternToSegments)
}

function shouldIgnorePath(pathValue, compiledPatterns) {
  if (!compiledPatterns || !compiledPatterns.length) return false
  const pathSegments = pathToSegments(pathValue)
  return compiledPatterns.some((patternSegments) => matchSegments(patternSegments, pathSegments))
}

module.exports = {
  DEFAULT_IGNORE_PATHS,
  normalizeIgnorePaths,
  compileIgnorePaths,
  shouldIgnorePath
}
