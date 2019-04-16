const Configorama = require('./main')

module.exports = function configoramaAsync() {
  return (args) => {
    const { filePath, settings = {} } = args
    const finalSettings = Object.assign({}, settings, { sync: true })
    const options = finalSettings.options || {}
    const config = new Configorama(filePath, finalSettings)
    return config.init(options)
  }
}
