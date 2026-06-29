import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextra from 'nextra'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))

const withNextra = nextra({
  latex: true,
  defaultShowCopyCode: true,
  search: {
    codeblocks: false
  },
  contentDirBasePath: '/'
})

export default withNextra({
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true
  },
  turbopack: {
    root: siteRoot
  }
})
