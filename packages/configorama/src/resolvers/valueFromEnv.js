// Resolves values from process.env environment variables
// Matches ${env:VAR_NAME} syntax with optional fallback values

const envRefSyntax = RegExp(/^env:/g)

function getValueFromEnv(variableString, env = process.env) {
  const requestedEnvVar = variableString.split(':')[1]
  // console.log('requestedEnvVar', requestedEnvVar)
  if (requestedEnvVar === '') {
    throw new Error(`Invalid variable syntax for environment variable reference "${variableString}". 

\${env} variable must have a key path. 

Example: \${env:MY_ENV_VAR}
`)
  }

  const valueToPopulate = env[requestedEnvVar]
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'env',
  source: 'user',
  syntax: '${env:ENV_VAR}',
  description: 'Resolves environment variables. Examples: ${env:MY_ENV_VAR}, ${env:MY_ENV_VAR_TWO, "fallbackValue"}',
  match: envRefSyntax,
  resolver: getValueFromEnv
}
