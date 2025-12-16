/**
 * Worker for synchronous HCL parsing using sync-rpc
 * This file is executed in a separate process to handle async @cdktf/hcl2json parsing
 */

module.exports = async function parseHclWorker(contents, filename = 'config.tf') {
  try {
    const { parse } = require('@cdktf/hcl2json')
    const result = await parse(filename, contents)
    return result
  } catch (error) {
    throw new Error(`Failed to parse HCL: ${error.message}`)
  }
}
