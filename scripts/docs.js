const path = require('path')
const { markdownMagic } = require('markdown-magic')

const markdownPath = path.join(__dirname, '..', 'README.md')
// README uses <!-- doc-gen ... --> / <!-- end-doc-gen --> comment blocks.
// v3 detected these automatically; v4 defaults to <!-- docs --> / <!-- /docs -->,
// so we configure the custom open/close words explicitly.
markdownMagic(markdownPath, { open: 'doc-gen', close: 'end-doc-gen' }, () => {
  console.log('Docs done')
})
