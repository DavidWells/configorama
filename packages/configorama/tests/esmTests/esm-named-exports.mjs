// ESM named exports
export const config = {
  my: 'named-config',
  number: '${env:envNumber}',
  flag: '${opt:stage}'
}

export function getConfig() {
  return {
    my: 'named-function-config',
    number: '${env:envNumber}',
    flag: '${opt:stage}'
  }
}