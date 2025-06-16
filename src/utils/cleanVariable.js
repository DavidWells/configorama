const { findNestedVariables } = require('./find-nested-variables')

const DEBUG = false
/**
 * Convert variable into string
 * ${opt:foo} => 'opt:foo'
 * @param match The variable match instance variable part
 * @returns {string} The cleaned variable match
 */

const fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-\/,'" ]+?)\)/g)
const funcRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
module.exports = function cleanVariable(
  match, 
  variableSyntax, 
  simple, 
  caller, 
  recursive = false,
) {
  if (DEBUG) {
    console.log(`Clean input  [${caller}]`, match)
  }
  
  // const outermostMatch = removeOuterMostBraces(match)
  // console.log('outermostMatch', outermostMatch)
  // return outermostMatch

  let varToClean = match

  /*
  const nestedVar = findNestedVariables(match, variableSyntax)
  console.log('nestedVarssss', nestedVar)
  if (nestedVar.length > 1) {
    const lastMatch = nestedVar[nestedVar.length - 1]
    console.log(`Clean output nested [${caller}]`, lastMatch.variable)
    return lastMatch.variable
    console.log('lastMatch', lastMatch)
    const matchIndex = lastMatch.varString.match(/__VAR_(\d+)__/)
    console.log('matchIndex', matchIndex)
    if (matchIndex) {
      const index = parseInt(matchIndex[1]) 
      console.log('index', index)
      console.log('nestedVar', nestedVar)
      console.log('nestedVar[index]', nestedVar[index])
      varToClean = lastMatch.varString.replace(/__VAR_(\d+)__/g, nestedVar[index].fullMatch)
      return varToClean
    }
  }
  // process.exit(1)
  /** */

  const clean = varToClean.replace(variableSyntax, (context, contents) => {
    return contents.trim()
  })

  // if (recursive && clean.match(variableSyntax)) {
  //   return cleanVariable(clean, variableSyntax, simple, caller, true)
  // }
  if (DEBUG) {
    console.log(`Clean output [${caller}]`, clean)
  }
  return clean

  // Support for simple variable cleaning with no space tweaks
  if (simple) {
    return clean
  }

  // Support for function matches that dont need space alterations
  if (!clean.match(fileRefSyntax) && funcRegex.exec(clean)) {
    return clean
  }

  // If file ref, add spaces after commas
  // Special case for file(thing, arg, argTwo)
  if (clean.match(fileRefSyntax)) {
    // replace spaces before and after commas
    return clean.replace(/\s*,\s*/g, ', ')
  }

  return clean.replace(/\s+(?=([^"']*"[^"']*")*[^"']*$)/g, '')
  // ^ trim White Space OutSide Quotes https://regex101.com/r/BuBNPN/1
  // Needed for fallback values with spaces. ${empty, 'fallback value with space'}
}


function findOutermostBraces(str) {
  const matches = []
  let i = 0
  
  while (i < str.length) {
    if (str.substring(i, i + 2) === '${') {
      let braceCount = 1
      let start = i
      i += 2
      
      while (i < str.length && braceCount > 0) {
        if (str[i] === '{') braceCount++
        else if (str[i] === '}') braceCount--
        i++
      }
      
      if (braceCount === 0) {
        matches.push(str.substring(start, i))
      }
    } else {
      i++
    }
  }
  
  return matches
}

/**
 * Removes the outermost ${} from a string
 * @param {string} str - The input string containing ${} syntax
 * @returns {string} The string with outermost ${} removed
 * @example
 * removeOuterMostBraces('${eval(${self:three} > ${self:four})}') 
 * // returns 'eval(${self:three} > ${self:four})'
 */
function removeOuterMostBraces(str) {
  const matches = findOutermostBraces(str)
  if (matches.length === 0) return str
  
  const outermostMatch = matches[0]
  return outermostMatch.slice(2, -1)
}
