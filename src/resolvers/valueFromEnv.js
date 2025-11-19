
const envRefSyntax = RegExp(/^env:/g)

function getValueFromEnv(variableString) {
  const requestedEnvVar = variableString.split(':')[1]
  // console.log('requestedEnvVar', requestedEnvVar)
  if (requestedEnvVar === '') {
    throw new Error(`Invalid variable syntax for environment variable reference "${variableString}". 

\${env} variable must have a key path. 

Example: \${env:MY_ENV_VAR}
`)
  }

  let valueToPopulate
  if (requestedEnvVar !== '' || '' in process.env) {
    valueToPopulate = process.env[requestedEnvVar]
  } else {
    valueToPopulate = process.env
  }
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'env',
  syntax: '${env:ENV_VAR}',
  description: 'Resolves environment variables. Examples: ${env:MY_ENV_VAR}, ${env:MY_ENV_VAR_TWO, "fallbackValue"}',
  match: envRefSyntax,
  resolver: getValueFromEnv
}
