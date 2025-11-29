const safeChalk = require('safe-chalk')
const minimist = require('minimist')
const argv = minimist(process.argv.slice(2))
 
// If --json flag disable chalk colors
const DISABLE_COLORS = argv.json || process.env.NO_COLORS
 
// Export chalk instance for usage in CLI
module.exports = safeChalk(DISABLE_COLORS)