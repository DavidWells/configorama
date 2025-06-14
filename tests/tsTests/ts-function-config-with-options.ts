interface DynamicArgs {
  foo: string;
  bar: string;
}

interface ConfigObject {
  one: string;
  two: string;
}

function createConfig(args: DynamicArgs): ConfigObject {
  return {
    one: args.foo,
    two: args.bar
  }
}

export = createConfig