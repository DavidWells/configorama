const os = require('os')
const fs = require('fs')
const path = require('path')
const findUp = require('find-up')

module.exports = function getFullPath(fileString, cwd) {
  const configPath = cwd || process.cwd()
  const relativePath = fileString.replace('~', os.homedir())

  let fullFilePath = (path.isAbsolute(relativePath) ? relativePath : path.join(configPath, relativePath))

  if (fs.existsSync(fullFilePath)) {
    // Get real path to handle potential symlinks (but don't fatal error)
    fullFilePath = fs.realpathSync(fullFilePath)

  // Only match files that are relative
  } else if (relativePath.match(/\.\//)) {
    const cleanName = path.basename(relativePath)
    fullFilePath = findUp.sync(cleanName, { cwd: configPath })
  }

  return fullFilePath
}
