const { makeHeader, logHeader : logHeaderBox } = require('@davidwells/box-logger')

function logHeader(message) {
  logHeaderBox({
    content: message,
    borderRight: true,
    minWidth: 80,
    fontStyle: 'bold',
    borderStyle: 'bold',
    borderColor: 'cyanBright',
  })
}

module.exports = {
  logHeader
}