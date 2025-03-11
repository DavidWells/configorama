const { trim } = require('./lodash')

function formatArg(arg) {
  const cleanArg = trim(arg).replace(/^('|")/, '').replace(/('|")$/, '')
  if (cleanArg.match(/^{([^}]+)}$/)) {
    return JSON.parse(cleanArg)
  }
  if (cleanArg.match(/^\[([^}]+)\]$/)) {
    return JSON.parse(cleanArg)
  }
  if (cleanArg.match(/^{(.*)}$/)) {
    return JSON.parse(cleanArg)
  }
  return cleanArg
}

module.exports = function formatArgs(args) {
  if (typeof args === 'string') {
    return formatArg(args)
  }
  return args.map((arg) => {
    return formatArg(arg)
  })
}
