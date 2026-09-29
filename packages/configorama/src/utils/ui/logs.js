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

module.exports = {
  logHeader
}