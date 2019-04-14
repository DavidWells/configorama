const Configorama = require('./main')

module.exports = function configoramaAsync() {
  return (settings) => {
    const { filePath, options, cliOptions } = settings
    const config = new Configorama(filePath, options)
    return config.init(cliOptions)
  }
}
