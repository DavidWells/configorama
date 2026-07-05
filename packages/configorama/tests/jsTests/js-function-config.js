module.exports = () => {
  return {
    my: 'config',
    number: '${env:envNumber}',
    flag: '${opt:stage}'
  }
}
