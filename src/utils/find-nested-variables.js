/**
 * Processes nested variable interpolations in a string and collects all matches
 * @param {string} input - The input string containing variable interpolations
 * @param {boolean} debug - Whether to print debug information
 * @returns {Array} Array of match objects containing full match and captured group
 */
function findNestedVariables(input, regex, debug = false) {
  let str = input
  let matches = []
  let match
  let iteration = 0
  
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
      match.fullMatch = match.fullMatch.replace(`__REPLACED_${replacedIndex}__`, matches[replacedIndex].fullMatch)
      match.variable = match.variable.replace(`__REPLACED_${replacedIndex}__`, matches[replacedIndex].fullMatch)
    }
    return match
  })

  if (debug) console.log(`\nTotal matches found: ${matches.length}`)
  return matches
}

module.exports = {
  findNestedVariables
}