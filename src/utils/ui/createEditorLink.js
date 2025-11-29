const path = require('path')
const chalk = require('./chalk')

/**
 * Creates a hyperlink for the default editor (Cursor/VS Code)
 * @param {string} filePath - The file path to link to
 * @param {number} line - Line number (default: 1)
 * @param {number} column - Column number (default: 1)
 * @param {string} customDisplay - Custom display text (default: filename:line)
 * @param {string|false} color - Chalk color for the link (default: 'cyanBright'), or false to skip coloring
 * @returns {string} The hyperlink string
 */
function createEditorLink(filePath, line = 1, column = 1, customDisplay = null, color = 'cyanBright') {
  const absolutePath = path.resolve(filePath)
  const url = `cursor://file${absolutePath}:${line}:${column}`
  const display = customDisplay ? customDisplay: `${path.basename(filePath)}:${line}`
  
  let displayText = display
  if (color !== false) {
    if (typeof color === 'string' && color.startsWith('#')) {
      displayText = chalk.hex(color)(display)
    } else {
      displayText = chalk[color](display)
    }
  }
  
  return `\x1b]8;;${url}\x1b\\${displayText}\x1b]8;;\x1b\\`
}

module.exports = {
  createEditorLink
}
