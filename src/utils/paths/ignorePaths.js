const DEFAULT_IGNORE_PATHS = [
  '**.Fn::Sub',
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
  if (!patternSegments.length) return pathSegments.length === 0

  const [head, ...tail] = patternSegments
  if (head === '**') {
    if (matchSegments(tail, pathSegments)) return true
    return pathSegments.length > 0 && matchSegments(patternSegments, pathSegments.slice(1))
  }

  if (!pathSegments.length) return false
  if (head !== '*' && head !== pathSegments[0]) return false
  return matchSegments(tail, pathSegments.slice(1))
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
