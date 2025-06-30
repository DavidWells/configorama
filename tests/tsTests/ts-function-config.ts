interface ConfigObject {
  my: string;
  number: string;
  flag: string;
}

interface DynamicArgs {
  [key: string]: any;
}

function createConfig(args?: DynamicArgs): ConfigObject {
  return {
    my: 'config',
    number: '${env:envNumber}',
    flag: '${opt:stage}'
  }
}

export = createConfig