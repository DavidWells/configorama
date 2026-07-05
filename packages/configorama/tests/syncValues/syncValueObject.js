
module.exports.func = (config) => {
  // console.log('config', config)
  /* generate dynamic config values and return them */
  return {
    key: 'syncValueFromObject',
    keyTwo: 'syncValueTwoFromObject',
    keyThree: '${self:normalKey}'
  }
}
