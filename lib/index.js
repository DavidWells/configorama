const Configorama = require('./main')
const forceSync = require('sync-rpc')

module.exports = Configorama

module.exports.sync = (filePath, opts, cliOptions) => {
  return forceSync(require.resolve('./async'))({filePath, options: opts, cliOptions})
}
