// TS named exports referenced from YAML via ${file(./ts-named-exports.ts):name}
export const config = {
  my: 'named-config',
  flag: '${opt:stage}'
}

export function getConfig () {
  return { my: 'named-function-config' }
}

export const other = { x: 1 }
