const YAML = require('./yaml')
const JSON = require('./json5')

/**
 * Parse HCL content into JavaScript object
 * Uses @cdktf/hcl2json to convert HCL to JSON
 * @param {string} hclContents - HCL string to parse
 * @param {string} [filename='config.tf'] - Filename for context
 * @returns {Promise<Object>} Parsed HCL object
 * @throws {Error} If HCL parsing fails
 */
async function parse(hclContents, filename = 'config.tf') {
  let hclObject = {}
  try {
    const { parse: hclParse } = require('@cdktf/hcl2json')
    const result = await hclParse(filename, hclContents)
    hclObject = result
  } catch (e) {
    throw new Error(`Failed to parse HCL: ${e.message}`)
  }
  return hclObject
}

/**
 * Synchronous HCL parsing using child process
 * @param {string} hclContents - HCL string to parse
 * @param {string} [filename='config.tf'] - Filename for context
 * @returns {Object} Parsed HCL object
 * @throws {Error} If HCL parsing fails
 */
function parseSync(hclContents, filename = 'config.tf') {
  const { execFileSync } = require('child_process')
  const scriptPath = require.resolve('./hcl-parse-script.js')

  try {
    const result = execFileSync(process.execPath, [scriptPath, filename, hclContents], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024  // 10MB buffer
    })
    return JSON.parse(result.trim())
  } catch (error) {
    // Check if error output contains JSON error
    if (error.stderr) {
      try {
        const errorData = JSON.parse(error.stderr)
        throw new Error(`Failed to parse HCL: ${errorData.error}`)
      } catch (parseErr) {
        // If stderr is not JSON, use original error
        throw new Error(`Failed to parse HCL: ${error.message}`)
      }
    }
    throw new Error(`Failed to parse HCL: ${error.message}`)
  }
}

/**
 * Convert JavaScript object to HCL string
 * Note: HCL generation is complex and not fully supported
 * This is a placeholder for potential future implementation
 * @param {Object} object - Object to convert to HCL
 * @returns {string} HCL string representation
 * @throws {Error} Always throws - HCL generation not implemented
 */
function dump(object) {
  throw new Error('HCL generation (dump) is not currently supported. HCL files can be read but not written.')
}

/**
 * Convert HCL content to YAML format
 * @param {string} hclContents - HCL string to convert
 * @param {string} [filename='config.tf'] - Filename for context
 * @returns {Promise<string>} YAML string representation
 * @throws {Error} If conversion fails
 */
async function toYaml(hclContents, filename = 'config.tf') {
  let yml
  try {
    const parsed = await parse(hclContents, filename)
    yml = YAML.dump(parsed)
  } catch (e) {
    throw new Error(`Failed to convert HCL to YAML: ${e.message}`)
  }
  return yml
}

/**
 * Convert HCL content to JSON format
 * @param {string} hclContents - HCL string to convert
 * @param {string} [filename='config.tf'] - Filename for context
 * @returns {Promise<string>} JSON string representation
 * @throws {Error} If conversion fails
 */
async function toJson(hclContents, filename = 'config.tf') {
  let json
  try {
    const parsed = await parse(hclContents, filename)
    json = JSON.dump(parsed)
  } catch (e) {
    throw new Error(`Failed to convert HCL to JSON: ${e.message}`)
  }
  return json
}

module.exports = {
  parse: parseSync,  // Export sync version for compatibility with existing parsers
  parseAsync: parse,  // Export async version for direct use
  parseSync: parseSync,
  dump: dump,
  toYaml: toYaml,
  toJson: toJson
}
