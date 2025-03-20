/**
 * Processes nested variable interpolations in a string and collects all matches
 * @param {string} input - The input string containing variable interpolations
 * @param {boolean} debug - Whether to print debug information
 * @returns {Array} Array of match objects containing full match and captured group
 */
function findNestedVariablesx(input, regex, debug = false) {
  let str = input
  let matches = []
  let match
  let iteration = 0

  console.log('input', input)
  
  if (debug) console.log(`Initial string: ${str}`)

  // Process string until no more matches are found
  while (true) {
    iteration++
    if (debug) console.log(`\nIteration ${iteration}:`)
    
    // Reset regex index
    regex.lastIndex = 0
    
    // Find the next match
    match = regex.exec(str)
    if (!match) break
    
    // Log match details if in debug mode
    if (debug) {
      console.log(`Match: ${match[0]}`)
      console.log(`Captured group: ${match[1]}`)
    }
    
    // Store the match
    matches.push({
      fullMatch: match[0],
      variable: match[1],
      order: iteration
    })
    
    // Replace the match with placeholder
    str = str.replace(regex, `__REPLACED_${iteration - 1}__`)
    if (debug) console.log(`After replacement: ${str}`)
  }

  // Replace the `__REPLACED_${iteration - 1}__` with the original match
  matches = matches.map((match, index) => {
    const indexOfReplaced = match.fullMatch.match(/__REPLACED_(\d+)__/)
    if (indexOfReplaced) {
      const replacedIndex = parseInt(indexOfReplaced[1])
      match.fullMatch = match.fullMatch.replace(`__REPLACED_${replacedIndex}__`, matches[replacedIndex].variable)
      match.variable = match.variable.replace(`__REPLACED_${replacedIndex}__`, matches[replacedIndex].variable)
    }
    return match
  })

  if (debug) console.log(`\nTotal matches found: ${matches.length}`)
  return matches
}

/**
 * Finds all nested variable interpolations in a string while preserving original syntax
 * 
 * This function handles complex nested variables like:
 * ${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}
 * 
 * The returned matches will include:
 * 1. innermost variables first (e.g., ${defaultStage})
 * 2. middle variables next (e.g., ${opt:stage, ${defaultStage}})
 * 3. outermost variables last (e.g., the entire expression)
 * 
 * Each variable retains its original syntax even in nested form.
 * 
 * @param {string} input - The input string containing variable interpolations
 * @param {RegExp} regex - The regex pattern to match variables
 * @param {boolean} debug - Whether to print debug information
 * @returns {Array} Array of match objects with fullMatch, variable, varString and other properties
 */
function findNestedVariables(input, regex, debug = false) {
  // Create a copy of the input for replacement tracking
  let workingString = input
  // console.log('workingString', workingString)
  // Store matches with their positions in the original string
  let matches = []
  // Track original positions and replacements
  let replacements = []
  let match
  let iteration = 0
  
  if (debug) console.log(`Initial string: ${input}`)

  // First pass: Find all matches and create unique placeholders
  while (true) {
    iteration++
    if (debug) console.log(`\nIteration ${iteration}:`)
    
    // Reset regex index
    regex.lastIndex = 0
    
    // Find the next match in the working string
    match = regex.exec(workingString)
    if (!match) break
    
    // Generate a unique placeholder
    const placeholder = `__VAR_${iteration - 1}__`
    
    // Store match details
    const matchInfo = {
      fullMatch: match[0],
      variable: match[1],
      order: iteration,
      start: match.index,
      end: match.index + match[0].length,
      placeholder
    }
    
    if (debug) {
      console.log(`Match: ${match[0]}`)
      console.log(`Captured group: ${match[1]}`)
      console.log(`Position: ${match.index}`)
    }
    
    matches.push(matchInfo)
    
    // Store replacement info
    replacements.push({
      original: match[0],
      placeholder,
      start: match.index,
      end: match.index + match[0].length
    })
    
    // Replace in working string (to find next match)
    workingString = workingString.substring(0, match.index) + 
                   placeholder + 
                   workingString.substring(match.index + match[0].length)
    
    if (debug) console.log(`After replacement: ${workingString}`)
  }
  
  if (debug) console.log(`\nTotal matches found: ${matches.length}`)
  
  // We need to store varString - the variable string with placeholders
  for (let i = 0; i < matches.length; i++) {
    // First match, the variable is the same as varString
    if (i === 0) {
      matches[i].varString = matches[i].variable
    } else {
      // For other matches, we need to copy the original variable with placeholders
      matches[i].varString = matches[i].variable
    }
  }
  
  // Second pass: Reconstruct each variable with original nested syntax
  // We need to do this recursively to ensure all placeholders are replaced properly
  function replaceAllPlaceholders(text, matchesArray) {
    let result = text
    let needsAnotherPass = false
    
    // Replace all placeholders with their original matches
    for (let i = 0; i < matchesArray.length; i++) {
      const m = matchesArray[i]
      if (result.includes(m.placeholder)) {
        result = result.replace(
          new RegExp(m.placeholder, 'g'), 
          m.fullMatch
        )
        needsAnotherPass = true
      }
    }
    
    // If we made replacements, we might need another pass to handle nested placeholders
    if (needsAnotherPass) {
      return replaceAllPlaceholders(result, matchesArray)
    }
    
    return result
  }
  
  // For each match, reconstruct the original nested syntax
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i]
    
    // Skip if this match doesn't contain any placeholders
    if (!currentMatch.fullMatch.includes('__VAR_') && !currentMatch.variable.includes('__VAR_')) {
      continue
    }
    
    // Reconstruct with all nested variables
    currentMatch.fullMatch = replaceAllPlaceholders(currentMatch.fullMatch, matches)
    currentMatch.variable = replaceAllPlaceholders(currentMatch.variable, matches)
  }
  
  if (debug) {
    console.log("\nReconstructed matches:")
    matches.forEach((m, i) => {
      console.log(`Match #${i+1} (order ${m.order}):`)
      console.log(`Full: ${m.fullMatch}`)
      console.log(`Variable: ${m.variable}`)
      console.log(`VarString: ${m.varString}`)
      console.log(`Placeholder: ${m.placeholder}`)
    })
  }
  
  return matches
}


// // Test with the example
// const regex = /\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?)}/g
// const input = '${file(./config.${opt:stage, ${defaultStage}}.json):CREDS}'

// // Run the function with debug output
// const result = findNestedVariables(input, regex, true)

// // Display final result
// console.log("\nFinal result:")
// console.log(JSON.stringify(result, null, 2))

// module.exports = {
//   findNestedVariables
// }

module.exports = {
  findNestedVariables
}