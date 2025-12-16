#!/usr/bin/env node
/**
 * Standalone script to parse HCL content
 * Used by hcl.js for synchronous parsing via child_process
 */

async function main() {
  try {
    const args = process.argv.slice(2)
    const filename = args[0] || 'config.tf'
    const contents = args[1] || ''

    if (!contents) {
      throw new Error('HCL content is required')
    }

    const { parse } = require('@cdktf/hcl2json')
    const result = await parse(filename, contents)

    // Output result as JSON
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }))
    process.exit(1)
  }
}

main()
