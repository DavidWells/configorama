const path = require('path')
const markdownMagic = require('markdown-magic')

const markdownPath = path.join(__dirname, '..', 'README.md')
markdownMagic(markdownPath, () => {
  console.log('Docs done')
})
