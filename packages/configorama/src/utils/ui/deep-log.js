// Prints a fully expanded object (optionally labelled): deepLog to stdout for
// --verbose/--info output, deepDebug to stderr for debug traces
const util = require('util')

/**
 * Print a label and fully expanded object with the given writer
 * @param {(...args: any[]) => void} write - console.log or console.error
 * @param {any} objOrLabel - Object to print, or a label when logVal is given
 * @param {any} [logVal] - Object to print after the label
 */
function print(write, objOrLabel, logVal) {
  let obj = objOrLabel
  if (typeof objOrLabel === 'string') {
    obj = logVal
    write(objOrLabel)
  }
  write(util.inspect(obj, false, null, true))
}

/**
 * Print to stdout (presentation output)
 * @param {any} objOrLabel - Object to print, or a label when logVal is given
 * @param {any} [logVal] - Object to print after the label
 */
function deepLog(objOrLabel, logVal) {
  print(console.log, objOrLabel, logVal)
}

/**
 * Print to stderr (debug traces never touch stdout)
 * @param {any} objOrLabel - Object to print, or a label when logVal is given
 * @param {any} [logVal] - Object to print after the label
 */
function deepDebug(objOrLabel, logVal) {
  print(console.error, objOrLabel, logVal)
}

module.exports = deepLog
module.exports.deepDebug = deepDebug
