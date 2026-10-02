function logHeader(message) {
  // box-logger loaded on demand so non-display runs skip its require cost
  const { logHeader : logHeaderBox } = require('@davidwells/box-logger')
  logHeaderBox({
    content: message,
    borderRight: true,
    minWidth: 80,
    fontStyle: 'bold',
    borderStyle: 'bold',
    borderColor: 'cyanBright',
  })
}

function logDiagnosticHeader(message) {
  const { makeBox } = require('@davidwells/box-logger')
  console.error(makeBox({content:message,minWidth:80,borderColor:'cyanBright'}))
}

module.exports = {
  logDiagnosticHeader,
  logHeader
}