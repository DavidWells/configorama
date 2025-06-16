// const evalRefSyntax = RegExp(/^eval\((~?[\{\}\:\${}a-zA=>+!-Z0-9._\-\/,'"\*\` ]+?)?\)/g)
const evalRefSyntax = RegExp(/^eval\((.*)?\)/g)

async function getValueFromEval(variableString) {
  // console.log('getValueFromEval variableString', variableString)
  // console.log('getValueFromEval variableString', variableString)
  // Extract the expression inside eval()
  const match = variableString.match(/^eval\((.+)\)$/)
  // console.log('match', match)
  if (!match) {
    throw new Error(`Invalid eval syntax: ${variableString}. Expected format: eval(expression)`)
  }
  
  const expression = match[1].trim()
  // console.log('expression', expression)
  
  // Use "justin" variant to support strict comparison (===, !==) and other JS-like operators
  try {
    const { default: subscript } = await import('subscript/justin')
    
    // Handle string comparisons by ensuring both sides are quoted
    const processedExpression = expression.replace(/([a-zA-Z0-9_]+)\s*([=!<>]=?)\s*['"]([^'"]+)['"]/g, '"$1"$2"$3"')
    
    // console.log('processedExpression', processedExpression)
    const fn = subscript(processedExpression)
    const result = fn()
    return result
  } catch (error) {
    throw new Error(`Error evaluating expression "${expression}": ${error.message}`)
  }
}

module.exports = {
  type: 'eval',
  match: evalRefSyntax,
  resolver: getValueFromEval
}