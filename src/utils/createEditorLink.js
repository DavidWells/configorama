const path = require('path')
const chalk = require('./chalk')

/**
 * Creates a hyperlink for the default editor (Cursor/VS Code)
 * @param {string} filePath - The file path to link to
 * @param {number} line - Line number (default: 1)
 * @param {number} column - Column number (default: 1)
 * @param {string} customDisplay - Custom display text (default: filename:line)
 * @param {string} color - Chalk color for the link (default: 'cyanBright')
 * @returns {string} The hyperlink string
 */
function createEditorLink(filePath, line = 1, column = 1, customDisplay = null, color = 'cyanBright') {
  const absolutePath = path.resolve(filePath)
  const url = `cursor://file${absolutePath}:${line}:${column}`
  const display = customDisplay ? customDisplay: `${path.basename(filePath)}:${line}`
  
  return `\x1b]8;;${url}\x1b\\${chalk[color](display)}\x1b]8;;\x1b\\`
}

module.exports = {
  createEditorLink
}
