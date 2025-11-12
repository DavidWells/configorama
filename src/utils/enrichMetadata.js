const { splitCsv } = require('./splitCsv')

// Enriches variable metadata with resolution tracking data
/**
 * @param {object} metadata - The metadata object from collectVariableMetadata
 * @param {object} resolutionTracking - The resolution tracking data from Configorama instance
 * @returns {object} Enriched metadata with afterInnerResolution and resolvedFileRefs
 */
function enrichMetadata(metadata, resolutionTracking) {
  if (!resolutionTracking) {
    return metadata
  }

  const varKeys = Object.keys(metadata.variables)

  for (const key of varKeys) {
    const varInstances = metadata.variables[key]

    for (const varData of varInstances) {
      const pathKey = varData.path
      const trackingData = resolutionTracking[pathKey]

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
  const normalizedPaths = new Set()
  
  for (const pathKey in resolutionTracking) {
    const tracking = resolutionTracking[pathKey]
    if (tracking.calls && tracking.calls.length) {
      const lastCall = tracking.calls[tracking.calls.length - 1]
      // Check if this is a file() or text() reference
      const fileMatch = lastCall.propertyString.match(/^\$\{(?:file|text)\((.*?)\)/)
      if (fileMatch && fileMatch[1]) {
        let fileContent = fileMatch[1].trim()
        
        // Split by comma to separate file path from parameters/fallback values
        const parts = splitCsv(fileContent)
        let filePath = parts[0].trim()
        
        // Remove quotes if present
        filePath = filePath.replace(/^['"]|['"]$/g, '')
        
        // Skip deep references
        if (!filePath.includes('deep:')) {
          // Normalize path: ensure relative paths start with ./
          let normalizedPath = filePath
          if (!filePath.startsWith('./') && !filePath.startsWith('../') && !filePath.startsWith('/') && !filePath.startsWith('~')) {
            normalizedPath = './' + filePath
          }

          if (normalizedPath.startsWith('.//')) {
            normalizedPath = normalizedPath.replace('.//', './')
          }
          
          // Only add if not already present (normalized)
          if (!normalizedPaths.has(normalizedPath)) {
            normalizedPaths.add(normalizedPath)
            resolvedFileRefs.push(normalizedPath)
          }
        }
      }
    }
  }

  metadata.resolvedFileRefs = resolvedFileRefs

  return metadata
}

module.exports = enrichMetadata
