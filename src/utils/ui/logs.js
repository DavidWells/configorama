const { makeHeader, logHeader : logHeaderBox } = require('@davidwells/box-logger')

function logHeader(message) {
  logHeaderBox({
    content: message, 
    rightBorder: true, 
    minWidth: 80, 
    textStyle: 'bold',
    borderStyle: 'bold',
    borderColor: 'cyanBright',
  })
}

module.exports = {
  logHeader
}