
const envRefSyntax = RegExp(/^env:/g)

function getValueFromEnv(variableString) {
  const requestedEnvVar = variableString.split(':')[1]
  let valueToPopulate
  if (requestedEnvVar !== '' || '' in process.env) {
    valueToPopulate = process.env[requestedEnvVar]
  } else {
    valueToPopulate = process.env
  }
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  match: envRefSyntax,
  resolver: getValueFromEnv
}
