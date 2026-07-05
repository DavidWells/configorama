const path = require('path')
const fs = require('fs')
const Configorama = require('./main')
const getFullPath = require('./utils/paths/getFullFilePath')
const enrichMetadata = require('./utils/parsing/enrichMetadata')

/**
 * Force synchronous invocation of async API
 */
module.exports = function configoramaSync(variableSources = []) {
  const customVariableSources = variableSources.map((varSrc) => {
    /* Plugin factories: match/resolver do not survive the JSON trip through
       sync-rpc, so plugins carry a syncFactory path + JSON syncOptions and
       the real source is rebuilt here inside the worker process */
    if (varSrc.syncFactory) {
      const factoryPath = getFullPath(varSrc.syncFactory)
      if (!fs.existsSync(factoryPath)) {
        throw new Error(`Sync factory missing. Can't find ${factoryPath}`)
      }
      const createSource = require(factoryPath)
      if (typeof createSource !== 'function') {
        throw new Error(`Sync factory must export a function. Check ${factoryPath}`)
      }
      return createSource(varSrc.syncOptions || {})
    }

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
      const enrichedMetadata = await enrichMetadata(
        metadata,
        instance.resolutionTracking,
        instance.variableSyntax,
        instance.fileRefsFound,
        instance.originalConfig,
        instance.configFilePath,
        Object.keys(instance.filters),
        result, // pass resolved config for post-resolution enrichment
        options,
        instance.variableTypes
      )

      /* Collect custom metadata from worker-side sources, mirroring the
         collectMetadata loop the async API runs in src/index.js */
      for (const source of customVariableSources) {
        if (typeof source.collectMetadata === 'function') {
          const customData = source.collectMetadata()
          if (customData !== undefined && customData !== null) {
            const metadataKey = source.metadataKey || `${source.type}References`
            enrichedMetadata[metadataKey] = customData
          }
        }
      }

      return {
        variableSyntax: instance.variableSyntax,
        variableTypes: instance.variableTypes,
        config: result,
        originalConfig: instance.originalConfig,
        metadata: enrichedMetadata,
        resolutionHistory: enrichedMetadata.resolutionHistory,
      }
    }

    return result
  }
}
