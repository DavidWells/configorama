const Configorama = require('./main')
const parsers = require('./parsers')

module.exports.Configorama = Configorama

/**
 * Configorama async API
 * @param  {string|object} configPathOrObject - Path to config file or raw javascript config object
 * @param {object}  [settings] Information about the user.
 * @param {object}  [settings.options] - options to populate for ${opt:xyz}. These could be CLI flags
 * @param {string}  [settings.syntax] - Regex of variable syntax
 * @param {string}  [settings.configDir] - cwd of config. Needed if raw object passed in instead of file path
 * @param {array}   [settings.variableSources] - array of custom variable sources
 * @param {object}  [settings.filters] - Object of of custom filters
 * @param {object}  [settings.functions] - Object of of custom functions
 * @param {boolean} [settings.allowUnknownVars] - allow unknown variables to pass through without throwing errors
 * @param {boolean} [settings.allowUndefinedValues] - allow undefined values to pass through without throwing errors
 * @param {object|function} [settings.dynamicArgs] - values passed into .js config files if user using javascript config.
 * @param {boolean} [settings.returnMetadata] - return both config and metadata about variables found
 * @return {Promise} resolved configuration or {config, metadata} if returnMetadata is true
 */
module.exports = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, settings)
  const options = settings.options || {}
  const config = await instance.init(options)

  if (settings.returnMetadata) {
    const metadata = instance.collectVariableMetadata()

    // Enrich metadata with resolution tracking data collected during execution
    if (instance.resolutionTracking) {
      const varKeys = Object.keys(metadata.variables)

      for (const key of varKeys) {
        const varInstances = metadata.variables[key]

        for (const varData of varInstances) {
          const pathKey = varData.path
          const trackingData = instance.resolutionTracking[pathKey]

          if (trackingData && trackingData.calls && varData.resolveDetails) {
            // The last call represents the final state (all inner vars resolved)
            const lastCall = trackingData.calls[trackingData.calls.length - 1]

            // For each resolveDetail, find the matching call and set afterInnerResolution
            for (let i = 0; i < varData.resolveDetails.length; i++) {
              const detail = varData.resolveDetails[i]
              const isOutermost = i === varData.resolveDetails.length - 1

              if (isOutermost) {
                // For the outermost variable, use the last call's propertyString
                // This shows the state after all inner variables have been resolved
                let afterResolution = lastCall.propertyString
                if (afterResolution.startsWith('${') && afterResolution.endsWith('}')) {
                  afterResolution = afterResolution.slice(2, -1)
                }
                detail.afterInnerResolution = afterResolution

                if (lastCall.resolvedValue !== undefined) {
                  detail.resolvedValue = lastCall.resolvedValue
                }
              } else {
                // For inner variables, try to find a matching call
                for (const call of trackingData.calls) {
                  const callVar = call.variableString
                  const detailVar = detail.variable

                  if (callVar === detailVar || callVar.includes(detail.varString)) {
                    let afterResolution = call.propertyString
                    if (afterResolution.startsWith('${') && afterResolution.endsWith('}')) {
                      afterResolution = afterResolution.slice(2, -1)
                    }
                    detail.afterInnerResolution = afterResolution

                    if (call.resolvedValue !== undefined) {
                      detail.resolvedValue = call.resolvedValue
                    }
                    break
                  }
                }
              }
            }
          }
        }
      }

      // Build resolvedFileRefs array from tracking data
      // Only use the LAST call for each path (final resolved state)
      const resolvedFileRefs = []
      for (const pathKey in instance.resolutionTracking) {
        const tracking = instance.resolutionTracking[pathKey]
        if (tracking.calls && tracking.calls.length) {
          const lastCall = tracking.calls[tracking.calls.length - 1]
          // Check if this is a file() or text() reference
          const fileMatch = lastCall.propertyString.match(/^\$\{(?:file|text)\((.*?)\)/)
          if (fileMatch && fileMatch[1]) {
            let filePath = fileMatch[1].trim()
            // Remove quotes if present
            filePath = filePath.replace(/^['"]|['"]$/g, '')
            // Skip deep references
            if (!filePath.includes('deep:') && !resolvedFileRefs.includes(filePath)) {
              resolvedFileRefs.push(filePath)
            }
          }
        }
      }

      metadata.resolvedFileRefs = resolvedFileRefs
    }

    return {
      config,
      metadata
    }
  }

  return config
}

module.exports.sync = (configPathOrObject, settings = {}) => {
  const _settings = settings || {}
  if (_settings.dynamicArgs && typeof _settings.dynamicArgs === 'function') {
    throw new Error('Dynamic args must be serializable value for sync usage. Use Async instead')
  }
  if (!_settings.options) {
    const cliArgs = require('minimist')(process.argv.slice(2))
    _settings.options = cliArgs
  }
  const forceSync = require('sync-rpc')
  return forceSync(require.resolve('./sync'), _settings.variableSources)({
    filePath: configPathOrObject,
    settings: _settings
  })
}

// Export format utilities
module.exports.format = parsers
