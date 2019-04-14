const Configorama = require('./main')

module.exports = function configoramaAsync() {
  return (settings) => {
    const { filePath, options = {}, cliOptions = {} } = settings
    const opts = Object.assign({}, options, { sync: true })
    const config = new Configorama(filePath, opts)
    return config.init(cliOptions)
  }
}
