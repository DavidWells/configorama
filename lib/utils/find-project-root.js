const fs = require('fs')
const path = require('path')

function findProjectRoot(startDir = process.cwd(), maxLookup = 7) {
  // Start from the current directory or a specified directory
  let currentDir = startDir
  let lookupCount = 0
  
  // Keep looking up until we find .git, hit the root, or reach max lookup
  while (currentDir !== path.parse(currentDir).root && lookupCount < maxLookup) {
    if (fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir
    }
    // Move up one directory
    currentDir = path.dirname(currentDir)
    lookupCount++
  }
  
  // If we reach here, we couldn't find a .git directory within the limit
  return null
}

module.exports = {
  findProjectRoot
}