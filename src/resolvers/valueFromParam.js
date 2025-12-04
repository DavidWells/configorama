
const paramRefSyntax = RegExp(/^param:/g)

/**
 * Resolves parameter values following the Serverless Framework parameter resolution hierarchy:
 * 1. CLI params (--param="key=value")
 * 2. Stage-specific params (stages.<stage>.params)
 * 3. Default params (stages.default.params)
 *
 * @param {string} variableString - The variable string (e.g., "param:domain")
 * @param {Object} options - CLI options that may contain params
 * @param {Object} config - The full config object for stage-specific params
 * @returns {Promise<any>} The resolved parameter value
 */
function getValueFromParam(variableString, options = {}, config = {}) {
  const requestedParam = variableString.split(':')[1]

  if (requestedParam === '') {
    throw new Error(`Invalid variable syntax for parameter reference "${variableString}".

\${param} variable must have a key path.

Example: \${param:domain}
`)
  }

  let valueToPopulate

  // 1. First, check CLI params (--param="key=value")
  // The param option can be either a string or an array of strings
  if (options.param) {
    const params = Array.isArray(options.param) ? options.param : [options.param]

    // Parse param flags in the format "key=value"
    for (const param of params) {
      const [key, ...valueParts] = param.split('=')
      if (key === requestedParam) {
        valueToPopulate = valueParts.join('=') // rejoin in case value contains =
        return Promise.resolve(valueToPopulate)
      }
    }
  }

  // 2. Check for stage-specific params (stages.<stage>.params)
  const stage = options.stage || 'dev'
  if (config.stages && config.stages[stage] && config.stages[stage].params) {
    valueToPopulate = config.stages[stage].params[requestedParam]
    if (valueToPopulate !== undefined) {
      return Promise.resolve(valueToPopulate)
    }
  }

  // 3. Check for default params (stages.default.params)
  if (config.stages && config.stages.default && config.stages.default.params) {
    valueToPopulate = config.stages.default.params[requestedParam]
    if (valueToPopulate !== undefined) {
      return Promise.resolve(valueToPopulate)
    }
  }

  // 4. Check top-level params property (for backwards compatibility)
  if (config.params) {
    // Check stage-specific params first
    if (config.params[stage]) {
      valueToPopulate = config.params[stage][requestedParam]
      if (valueToPopulate !== undefined) {
        return Promise.resolve(valueToPopulate)
      }
    }

    // Then check default params
    if (config.params.default) {
      valueToPopulate = config.params.default[requestedParam]
      if (valueToPopulate !== undefined) {
        return Promise.resolve(valueToPopulate)
      }
    }
  }

  // If not found, return undefined (will trigger fallback if specified)
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'param',
  source: 'user',
  syntax: '${param:paramName}',
  description: 'Resolves parameter values from CLI flags, stage-specific params, or default params. Examples: ${param:domain}, ${param:key, "fallbackValue"}',
  match: paramRefSyntax,
  resolver: getValueFromParam
}
