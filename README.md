# Configorama

Dynamic configuration values.

## About

Resolves configuration variables from:

- CLI options
- ENV variables
- File references
- Other Key/values in config
- Async/sync JS functions
- Any source you'd like...

See [tests](https://github.com/DavidWells/configorama/tree/master/tests) for more examples.

## Usage

```js
const path = require('path')
const Configorama = require('configorama')
const cliFlags = require('minimist')(process.argv.slice(2))

const myConfigFilePath = path.join(__dirname, 'config.yml')
const configInstance = new Configorama(myConfigFilePath)

// resolve config values
const config = await configInstance.init(cliFlags)
```

## Custom variable sources

There are 2 ways to resolve variables from custom sources.

1. Use the baked in javascript method for [sync](https://github.com/DavidWells/configorama/blob/master/tests/syncValues/syncValue.yml) or [aysnc](https://github.com/DavidWells/configorama/blob/master/tests/asyncValues/asyncValue.yml) resolution.

2. Add your own variable syntax and resolver.

    ```js
    const config = new Configorama('path/to/configFile', {
      variableSources: [{
        // Match variables ${consul:xyz}
        match: RegExp(/^consul:/g),
        resolver: (varToProcess, opts, currentObject) => {
          // Make remote call to consul
          return Promise.resolve(varToProcess)
        }
      }]
    })

    const resolvedObject = await config.init(args)
    ```

    This would match the following config:

    ```yml
    key: ${consul:xyz}
    ```

## Inspiration

This is forked out of the [serverless framework](https://github.com/serverless/serverless/) variable system.

**Mad props to:**

[erikerikson](https://github.com/erikerikson), [eahefnawy](https://github.com/eahefnawy), [HyperBrain](https://github.com/HyperBrain), [ac360](https://github.com/ac360), [gcphost](https://github.com/gcphost), [pmuens](https://github.com/pmuens), [horike37](https://github.com/horike37), [lorengordon](https://github.com/lorengordon), [AndrewFarley](https://github.com/AndrewFarley), [tobyhede](https://github.com/tobyhede), [johncmckim](https://github.com/johncmckim), [mangas](https://github.com/mangas), [e-e-e](https://github.com/e-e-e), [BasileTrujillo](https://github.com/BasileTrujillo), [miltador](https://github.com/miltador), [sammarks](https://github.com/sammarks), [RafalWilinski](https://github.com/RafalWilinski), [indieisaconcept](https://github.com/indieisaconcept), [svdgraaf](https://github.com/svdgraaf), [infiniteluke](https://github.com/infiniteluke), [j0k3r](https://github.com/j0k3r), [craigw](https://github.com/craigw), [bsdkurt](https://github.com/bsdkurt), [aoskotsky-amplify](https://github.com/aoskotsky-amplify), and all the other folks who contributed to the variable system.
