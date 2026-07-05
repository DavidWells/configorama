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

    let hcl2json
    try {
      hcl2json = require('@cdktf/hcl2json')
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'HCL/Terraform file support requires "@cdktf/hcl2json" to be installed. ' +
          'Please install it: npm install @cdktf/hcl2json'
        )
      }
      throw err
    }

    const result = await hcl2json.parse(filename, contents)

    // Output result as JSON
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }))
    process.exit(1)
  }
}

main()
