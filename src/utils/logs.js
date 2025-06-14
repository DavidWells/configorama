const { makeHeader } = require('@davidwells/box-logger')

function logHeader(message) {
  console.log(makeHeader({
    text: message, 
    rightBorder: true, 
    minWidth: 80, 
    textStyle: 'bold',
    borderStyle: 'bold',
    borderColor: 'cyanBright',
  }))
}

module.exports = {
  logHeader
}