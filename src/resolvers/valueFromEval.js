const evalRefSyntax = RegExp(/^eval\(/g)

async function getValueFromEval(variableString) {
  // Extract the expression inside eval()
  const match = variableString.match(/^eval\((.+)\)$/)
  if (!match) {
    throw new Error(`Invalid eval syntax: ${variableString}. Expected format: eval(expression)`)
  }
  
  const expression = match[1].trim()
  
  // Use subscript for safe evaluation
  try {
    const { default: subscript } = await import('subscript')
    const fn = subscript(expression)
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