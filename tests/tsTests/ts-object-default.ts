interface ConfigObject {
  my: string;
  number: string;
  flag: string;
}

const config: ConfigObject = {
  my: 'config',
  number: '${env:envNumber}',
  flag: '${opt:stage}'
}

export default config