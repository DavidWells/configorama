// Rewrites relative file()/text() refs written inside a referenced file so they point at
// files next to that file, expressed relative to the root config folder they resolve from
const fs = require('fs')
const path = require('path')

// ${file(./x)} / ${text('../x')}: the call, optional quote, and a ./ or ../ relative path
const RELATIVE_FILE_REF = /(\b(?:file|text)\(\s*)(['"]?)(\.{1,2}\/[^)'"$]+?)\2(\s*[),])/g

/**
 * Rebase relative file()/text() refs in a referenced file's text. A ref whose target exists
 * next to that file is rewritten relative to the root config folder; any other ref (target
 * not there, absolute, aliased, or holding a variable) is left as written, so it resolves
 * from the root folder and find-up as before.
 * @param {string} text - Raw contents of the referenced file
 * @param {string} fileDir - Folder of the referenced file
 * @param {string} rootDir - Folder refs are resolved from (the root config's)
 * @returns {string} Text with refs rebased
 */
function rebaseFileRefs(text, fileDir, rootDir) {
  if (typeof text !== 'string' || !fileDir || !rootDir) return text
  if (path.resolve(fileDir) === path.resolve(rootDir)) return text
  if (text.indexOf('file(') === -1 && text.indexOf('text(') === -1) return text
  return text.replace(RELATIVE_FILE_REF, (match, call, quote, refPath, close) => {
    const target = path.join(fileDir, refPath)
    if (!fs.existsSync(target)) return match
    let rebased = path.relative(rootDir, target).split(path.sep).join('/')
    if (!rebased.startsWith('.')) rebased = `./${rebased}`
    return `${call}${quote}${rebased}${quote}${close}`
  })
}

module.exports = { rebaseFileRefs }
