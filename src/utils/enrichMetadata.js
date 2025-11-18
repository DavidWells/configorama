const { splitCsv } = require('./splitCsv')

/**
 * Extract file path from a file() or text() reference string
 * @param {string} propertyString - The property string containing file/text reference
 * @returns {object|null} Object with filePath, or null if no match
 */
function extractFilePath(propertyString) {
  const fileMatch = propertyString.match(/^\$\{(?:file|text)\((.*?)\)/)
  if (!fileMatch || !fileMatch[1]) {
    return null
  }
  
  const fileContent = fileMatch[1].trim()
  const parts = splitCsv(fileContent)
  let filePath = parts[0].trim()
  
  // Remove quotes if present
  filePath = filePath.replace(/^['"]|['"]$/g, '')
  
  return { filePath }
}

/**
 * Normalize a file path (add ./ prefix, fix .//, skip deep refs)
 * @param {string} filePath - The file path to normalize
 * @returns {string|null} Normalized path, or null if should be skipped
 */
function normalizePath(filePath) {
  // Skip deep references
  if (filePath.includes('deep:')) {
    return null
  }
  
  let normalized = filePath
  
  // Add ./ prefix for relative paths
  if (!filePath.startsWith('./') && 
      !filePath.startsWith('../') && 
      !filePath.startsWith('/') && 
      !filePath.startsWith('~')) {
    normalized = './' + filePath
  }
  
  // Fix double slashes
  if (normalized.startsWith('.//')) {
    normalized = normalized.replace('.//', './')
  }
  
  return normalized
}

// Enriches variable metadata with resolution tracking data
/**
 * @param {object} metadata - The metadata object from collectVariableMetadata
 * @param {object} resolutionTracking - The resolution tracking data from Configorama instance
 * @param {RegExp} variableSyntax - The variable syntax regex to detect variables in file paths
 * @returns {object} Enriched metadata with afterInnerResolution and resolvedFileRefs
 */
function enrichMetadata(metadata, resolutionTracking, variableSyntax) {
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
      
      const extracted = extractFilePath(lastCall.propertyString)
      if (extracted) {
        const normalizedPath = normalizePath(extracted.filePath)
        
        if (normalizedPath && !normalizedPaths.has(normalizedPath)) {
          normalizedPaths.add(normalizedPath)
          resolvedFileRefs.push(normalizedPath)
        }
      }
    }
  }

  metadata.resolvedFileRefs = resolvedFileRefs

  // Build resolvedFileRefsData array - maps resolved paths to their variable strings and glob patterns
  const resolvedFileRefsDataMap = new Map()
  
  // First pass: collect all resolved paths and their original variable strings
  for (const pathKey in resolutionTracking) {
    const tracking = resolutionTracking[pathKey]
    if (!tracking.calls || !tracking.calls.length) {
      continue
    }
    
    const lastCall = tracking.calls[tracking.calls.length - 1]
    const extracted = extractFilePath(lastCall.propertyString)
    
    if (!extracted) {
      continue
    }
    
    const resolvedPath = normalizePath(extracted.filePath)
    if (!resolvedPath) {
      continue
    }
    
    // Get original variable string from tracking
    const originalPropertyString = tracking.originalPropertyString
    if (!originalPropertyString) {
      continue
    }
    
    const origExtracted = extractFilePath(originalPropertyString)
    if (!origExtracted) {
      continue
    }
    
    const origPath = normalizePath(origExtracted.filePath)
    if (!origPath) {
      continue
    }
    
    // Initialize map entry if needed
    if (!resolvedFileRefsDataMap.has(resolvedPath)) {
      resolvedFileRefsDataMap.set(resolvedPath, {
        resolvedPath: resolvedPath,
        refs: [],
      })
    }
    
    const entry = resolvedFileRefsDataMap.get(resolvedPath)
    
    // Add original variable string with config path if not already present
    const alreadyExists = entry.refs.some(ref => ref.path === pathKey && ref.value === origPath)
    if (!alreadyExists) {
      const refEntry = { path: pathKey, value: origPath }
      // Check if the value contains variables
      if (variableSyntax && origPath.match(variableSyntax)) {
        refEntry.hasVariable = true
      }
      entry.refs.push(refEntry)
    }
  }
  
  // Second pass: generate glob patterns for each resolved path
  for (const [resolvedPath, data] of resolvedFileRefsDataMap) {
    const globPatternSet = new Set()
    
    for (const ref of data.refs) {
      // Check if variable path contains variables
      if (ref.value.match(variableSyntax)) {
        const globPattern = ref.value.replace(variableSyntax, '*')
        globPatternSet.add(globPattern)
      }
    }
    const patterns = Array.from(globPatternSet)
    if (patterns.length > 0) {
      data.globPatterns = patterns
    }
  }
  
  // Convert map to array
  const resolvedFileRefsData = Array.from(resolvedFileRefsDataMap.values())
  
  metadata.resolvedFileRefsData = resolvedFileRefsData

  return metadata
}

module.exports = enrichMetadata
