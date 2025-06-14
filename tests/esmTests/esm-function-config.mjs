// ESM function export
export default () => {
  return {
    my: 'config',
    number: '${env:envNumber}',
    flag: '${opt:stage}'
  }
}