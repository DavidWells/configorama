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

/**
 * Enriches variable metadata with resolution tracking data.
 * @param {object} metadata - The metadata object from collectVariableMetadata.
 * @param {object} resolutionTracking - The resolution tracking data from Configorama instance.
 * @param {RegExp} variableSyntax - The variable syntax regex.
 * @param {Array} fileRefsFound - The (incomplete) list of file refs found during resolution.
 * @returns {object} Enriched metadata with resolution details and a complete file reference list.
 */
function enrichMetadata(metadata, resolutionTracking, variableSyntax, fileRefsFound = []) {
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
                detail.WHAT = 'nice'

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

  // Update fileDependencies.resolved with the resolved file refs
  if (metadata.fileDependencies) {
    metadata.fileDependencies.resolved = resolvedFileRefs
  }

  // Build fileRefsByRelativePath array
  const resolvedFileRefsDataMap = new Map()

  // First Pass: Collect all refs and attach glob patterns directly to each ref.
  for (const pathKey in resolutionTracking) {
    const tracking = resolutionTracking[pathKey]
    if (!tracking.calls || !tracking.calls.length) continue
    
    const lastCall = tracking.calls[tracking.calls.length - 1]
    const extracted = extractFilePath(lastCall.propertyString)
    if (!extracted) continue
    
    const resolvedPath = normalizePath(extracted.filePath)
    if (!resolvedPath) continue
    
    const originalPropertyString = tracking.originalPropertyString
    if (!originalPropertyString) continue
    
    const origExtracted = extractFilePath(originalPropertyString)
    if (!origExtracted) continue
    
    const origPath = normalizePath(origExtracted.filePath)
    if (!origPath) continue
    
    // Initialize map entry if needed
    if (!resolvedFileRefsDataMap.has(resolvedPath)) {
      resolvedFileRefsDataMap.set(resolvedPath, {
        resolvedPath: resolvedPath,
        refs: [],
      })
    }
    
    const entry = resolvedFileRefsDataMap.get(resolvedPath)
    
    const alreadyExists = entry.refs.some(ref => ref.path === pathKey && ref.value === origPath)
    if (!alreadyExists) {
      const refEntry = { 
        location: pathKey, 
        value: origPath,
        originalVariableString: originalPropertyString,
      }
      
      // Check for inner variables and generate glob pattern for this specific ref
      if (variableSyntax && origPath.match(variableSyntax)) {
        refEntry.hasInnerVariable = true
        refEntry.globPatterns = [ origPath.replace(variableSyntax, '*') ]
      }
      
      entry.refs.push(refEntry)
    }
  }
  
  // Second Pass: Aggregate glob patterns for the top-level 'allGlobPatterns' summary.
  for (const data of resolvedFileRefsDataMap.values()) {
    const allGlobs = new Set()
    for (const ref of data.refs) {
      if (ref.globPatterns) {
        ref.globPatterns.forEach(pattern => allGlobs.add(pattern))
      }
    }
    if (allGlobs.size > 0) {
      data.allGlobPatterns = Array.from(allGlobs)
    }
  }
  
  // Convert map to array for the final metadata object.
  const fileRefsByRelativePath = Array.from(resolvedFileRefsDataMap.values())

  // Build the complete, flat list of all file references
  const fileDetailsMap = new Map()
  for (const fileRef of fileRefsFound) {
    if (!fileDetailsMap.has(fileRef.relativePath)) {
      fileDetailsMap.set(fileRef.relativePath, fileRef)
    }
  }

  const fileRefsByConfigPath = []
  if (fileRefsByRelativePath.length > 0) {
    for (const resolvedFileData of fileRefsByRelativePath) {
      const details = fileDetailsMap.get(resolvedFileData.resolvedPath)
      if (details) {
        for (const ref of resolvedFileData.refs) {
          fileRefsByConfigPath.push({
            location: ref.location,
            relativePath: details.relativePath,
            filePath: details.filePath,
            originalVariableString: ref.originalVariableString,
            resolvedVariableString: details.resolvedVariableString,
            containsVariables: !!ref.hasInnerVariable,
            exists: details.exists,
            // Get glob patterns from the individual ref, default to empty array
            globPatterns: ref.globPatterns || [],
          })
        }
      }
    }
  }

  // Update fileDependencies with the enriched data
  if (metadata.fileDependencies) {
    metadata.fileDependencies.fileRefsByConfigPath = fileRefsByConfigPath
    metadata.fileDependencies.fileRefsByRelativePath = fileRefsByRelativePath
  }

  return metadata
}

module.exports = enrichMetadata