const path = require('path')
const fs = require('fs')
const Configorama = require('./main')
const getFullPath = require('./utils/getFullFilePath')
const enrichMetadata = require('./utils/enrichMetadata')

/**
 * Force synchronous invocation of async API
 */
module.exports = function configoramaSync(variableSources = []) {
  const customVariableSources = variableSources.map((varSrc) => {
    if (!varSrc.match || typeof varSrc.match !== 'string') {
      throw new Error('Variable source must be string for .sync usage')
    }
    if (!varSrc.resolver || typeof varSrc.resolver !== 'string') {
      throw new Error('Variable resolver must be path to file for .sync usage')
    }

    const fileExtension = path.extname(varSrc.resolver)
    if (!fileExtension) {
      throw new Error('Variable resolver must be path to javascript .js file for .sync usage')
    }

    const fullFilePath = getFullPath(varSrc.resolver)
    if (!fs.existsSync(fullFilePath)) {
      throw new Error(`Variable resolver missing. Can't find ${fullFilePath}`)
    }

    /* Create function in sync context */
    const resolverFunction = require(fullFilePath)
    if (!resolverFunction || typeof resolverFunction !== 'function') {
      throw new Error(`resolverFunction must export function`)
    }

    return {
      type: varSrc.type,
      /* Create regex in sync context */
      match: RegExp(varSrc.match, 'g'),
      resolver: resolverFunction
    }
  })
  return async (args) => {
    const { filePath, settings = {} } = args
    const syncSettings = { sync: true }
    if (customVariableSources && customVariableSources.length) {
      syncSettings.variableSources = customVariableSources
    }
    const finalSettings = Object.assign({}, settings, syncSettings)
    const options = finalSettings.options || {}
    const instance = new Configorama(filePath, finalSettings)
    const result = await instance.init(options)

    if (finalSettings.returnMetadata) {
      const metadata = instance.collectVariableMetadata()

      // Enrich metadata with resolution tracking data collected during execution
      const enrichedMetadata = enrichMetadata(
        metadata,
        instance.resolutionTracking,
        instance.variableSyntax,
        instance.fileRefsFound,
        instance.originalConfig,
        instance.configFilePath
      )

      return {
        config: result,
        metadata: enrichedMetadata
      }
    }

    return result
  }
}
