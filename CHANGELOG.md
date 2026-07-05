# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.2.1](https://github.com/DavidWells/configorama/compare/configorama@1.2.0...configorama@1.2.1) (2026-07-05)


### Bug Fixes

* **setup:** resolve tsc errors blocking publish; document type-check rule ([3279988](https://github.com/DavidWells/configorama/commit/3279988220394e7832b8142e079ca179e7ac0124))





# 1.2.0 (2026-07-05)


### Bug Fixes

* **core:** setup mode is explicit opt-in, never sniffed from process.argv ([649e52f](https://github.com/DavidWells/configorama/commit/649e52fe6f81bc18fd037712970b40b1aeee4397))
* **setup:** fail closed when stdin ends mid-wizard instead of exiting 0 ([d98cb94](https://github.com/DavidWells/configorama/commit/d98cb94582544fa60780bd8db06a0065d614ad13))
* **tests:** correct configWizard require path in wizard-help-test ([7004559](https://github.com/DavidWells/configorama/commit/70045594e41a6b6efed8caedbf31767fce97cbe6))
* **tests:** wizard-help script analyzes instead of resolving unresolvable fixture ([da4579e](https://github.com/DavidWells/configorama/commit/da4579ec49f3709f5fe3c36246b81d9e58e326da))


### Features

* 1Password resolver plugin ([#72](https://github.com/DavidWells/configorama/issues/72)) ([c35c15b](https://github.com/DavidWells/configorama/commit/c35c15bfdfbff5a9145042457cac8679e6875d8c))
* configx exec/env runner + 1Password syntax and UX ([#73](https://github.com/DavidWells/configorama/issues/73)) ([5ec86fe](https://github.com/DavidWells/configorama/commit/5ec86fe3bd83dc0402c2f0814aefc73410c0400c))
* **configx:** add setup command routing with one-target validation ([7f9a620](https://github.com/DavidWells/configorama/commit/7f9a620cc38ec9544dd66db2c2c25460f577e4aa))
* **configx:** add setup-shell command to install config-env shell integration ([c9db37f](https://github.com/DavidWells/configorama/commit/c9db37f51d291a1e3a3fb196d54879476ea0edbb))
* **configx:** real-shell e2e for config-env setup; shell fn propagates exit status ([6a8e57e](https://github.com/DavidWells/configorama/commit/6a8e57e9305e6340381ba14257d205b01f0af282))
* **configx:** setup --export target with answered-env merge and fail-closed cancel ([aeab5a2](https://github.com/DavidWells/configorama/commit/aeab5a2d9839c84ce29ed96ad7e065951aca4fcb))
* **configx:** setup child command target with fail-closed cancellation ([db25086](https://github.com/DavidWells/configorama/commit/db25086fb2323e8e38a66c7c45030b00f01bdb5e))
* **configx:** setup default menu with honest current-shell guidance ([b428746](https://github.com/DavidWells/configorama/commit/b428746f17e5b83d3c74933747893fd831a209ac))
* **configx:** setup write targets with sensitive-value confirmation and dry-run ([cd32ee1](https://github.com/DavidWells/configorama/commit/cd32ee1650eb0267a742ed63c4f268243c75e453))
* **core:** add applyAnswers helper with injectable env target ([88c95b8](https://github.com/DavidWells/configorama/commit/88c95b82313b5ec637b94a6baefd845e7a3d61ad))
* **core:** add safe dotenv and answers writers with managed-block merge ([502a738](https://github.com/DavidWells/configorama/commit/502a738ddd1e771a16e70f5bc98fe0a1259a437b))
* **core:** add setup engine with configorama.setup() library API ([214c9ae](https://github.com/DavidWells/configorama/commit/214c9aeb8ef9ed6d89a7d09e6f534fc0150b9d66))
* **core:** configorama setup CLI runs on the shared setup engine ([b0698ec](https://github.com/DavidWells/configorama/commit/b0698ec4384b95cad443f60c0484091d4cce3fcc))
* **core:** detect flat key=value content as dotenv ([1cb9688](https://github.com/DavidWells/configorama/commit/1cb9688779aa4f1fecc33b6f09b08fbdbe95ebd7))
* **core:** wizard prompt UI can render off stdout via streams.output ([a174c59](https://github.com/DavidWells/configorama/commit/a174c59263bcb592174d4b74f0d6e90c1738bccb))
* **onepassword:** accept bare item ID in colon syntax ([2736772](https://github.com/DavidWells/configorama/commit/2736772380d1f7cb91d7d73195faeea307ab374f))



## 1.0.2 (2026-07-03)


### Features

* harden dotenv file reference reporting ([ae6be7d](https://github.com/DavidWells/configorama/commit/ae6be7df6dd40cce30cec0022654199fd49d79d9))



## 1.0.1 (2026-07-03)


### Bug Fixes

* parse env file references ([54abf89](https://github.com/DavidWells/configorama/commit/54abf890ec8ccbc6d9d0869327e862f7f4390672))



# 1.0.0 (2026-06-29)


### Bug Fixes

* **eval:** source subscript parse from justin re-export ([932fd5b](https://github.com/DavidWells/configorama/commit/932fd5b2e97757d276373f7d11bd9deb92d455a4))
* **security:** block prototype-chain escape in eval/if expressions ([2778eba](https://github.com/DavidWells/configorama/commit/2778eba59ed1dfc7f54d8beb2f512b749ecc5cbb))


### Features

* **cli:** add config requirements workflow ([61e7131](https://github.com/DavidWells/configorama/commit/61e7131ec2e2a2ca903246906b6f67e0c80d2e42))
* **cli:** add inspect command, agent intent-recovery, and capabilities ([f344228](https://github.com/DavidWells/configorama/commit/f34422883d260fb5e1d38f74c15f838e249ad63f))
* **safe-mode:** add safety policy with blockDotEnv flag ([06051d4](https://github.com/DavidWells/configorama/commit/06051d44e46c6f12310bdb973a19816c058b7d53))


### Performance Improvements

* benchmark harness, performance smoke test, and CI workflow ([c62d497](https://github.com/DavidWells/configorama/commit/c62d4971dd91c81227c11275efbda6a310fc75b8))
* **clean-variable:** memoize variable-string cleaning ([5023894](https://github.com/DavidWells/configorama/commit/5023894777e0f04a8315f94f883c659be0657491))
* **git:** cache resolver lookups per config run ([704c4b5](https://github.com/DavidWells/configorama/commit/704c4b5ddfcb02f82bb40bf7f372a2f920ab6e04))
* **ignore-paths:** allocation-free glob matcher ([5e5eb40](https://github.com/DavidWells/configorama/commit/5e5eb40d74570e6dd4ddaf33eb67de8c0ce936c9))
* **resolution:** memoize ignore-path decisions per path ([3729489](https://github.com/DavidWells/configorama/commit/3729489e926bf79b21e955ea5aa043e978aaaf5a))
* **split-by-comma:** fast-path comma-free strings ([9746e1a](https://github.com/DavidWells/configorama/commit/9746e1a14b3d645e0a462fab3b99ffa2a705bc4a))



## 0.11.2 (2026-06-14)



## 0.11.1 (2026-06-14)


### Bug Fixes

* **fn-sub:** resolve configorama refs inside Fn::Sub, keep self/CFN verbatim ([#71](https://github.com/DavidWells/configorama/issues/71)) ([20a587f](https://github.com/DavidWells/configorama/commit/20a587f5ed67a09177a05b70371b3411a2ffe8ce))



# 0.11.0 (2026-06-02)


### Bug Fixes

* **api:** avoid signal handlers in library mode ([443e5ea](https://github.com/DavidWells/configorama/commit/443e5ea46831b4a223cbbab0bbd7ed34f89713ef))



## 0.10.3 (2026-05-31)


### Bug Fixes

* **cli:** mark binary executable ([3b47ac9](https://github.com/DavidWells/configorama/commit/3b47ac930ed82dfcf8386020205ebad87900b599))
* skip resolution for opaque paths ([7453a45](https://github.com/DavidWells/configorama/commit/7453a45ade403e899742295a06933148424ad8a0))


### Features

* **cli:** add raw and copy output flags ([4b0844e](https://github.com/DavidWells/configorama/commit/4b0844e11c87e517c86ca25076af9dfccf69689d))



## 0.10.2 (2026-05-31)



## 0.10.1 (2026-05-31)


### Bug Fixes

* preserve CloudFormation Fn::Sub bodies ([5ac09c3](https://github.com/DavidWells/configorama/commit/5ac09c3473d94cc5225d70ed9e0053099fba376d))



# 0.10.0 (2026-05-28)


### Bug Fixes

* **docs:** pass custom open/close to markdown-magic v4 ([d992c85](https://github.com/DavidWells/configorama/commit/d992c851bbad7412e5b6ef3e509a96157ce98638))
* **types:** declare ctx.fileContentCache in valueFromFile JSDoc ([6a6a8d9](https://github.com/DavidWells/configorama/commit/6a6a8d97eb61962a88c678c714c10b6dc6d61938))


### Features

* **cf:** multi-account CloudFormation variable resolution ([3c80bf1](https://github.com/DavidWells/configorama/commit/3c80bf15b33a070b962a10412c41c7a673cb20d5)), closes [#57](https://github.com/DavidWells/configorama/issues/57)


### Performance Improvements

* **file:** per-instance content cache to avoid repeated readFileSync ([58209a3](https://github.com/DavidWells/configorama/commit/58209a3424ae747a0eedeacca13243dc034bf084))
* **getProperties:** single walk-down instead of O(depth²) recurse-up on cache miss ([abcea1b](https://github.com/DavidWells/configorama/commit/abcea1b53a2277c2ec3801f758b53ea7b2940ea9))
* **init:** lazy-clone rawOriginalConfig only when metadata consumers need it ([b90920c](https://github.com/DavidWells/configorama/commit/b90920ced565eb2839bc7bec792915ca6280dbd3))
* **main:** use non-global test regex for boolean variableSyntax checks ([ba09ca2](https://github.com/DavidWells/configorama/commit/ba09ca200038ddee976355e293f7a2c91c4e1c89))
* **populate:** skip already-resolved paths in subsequent getProperties walks ([63b2f35](https://github.com/DavidWells/configorama/commit/63b2f35b335aed9d3122b6a70a7afaa712239ad2))
* **post-resolve:** replace traverse() package with native pre-order walker ([ae2947a](https://github.com/DavidWells/configorama/commit/ae2947a104d72173dbd77da3de12c09a0792072d)), closes [#7](https://github.com/DavidWells/configorama/issues/7) [#7](https://github.com/DavidWells/configorama/issues/7)
* **preProcess:** reuse precompiled precededByPatterns instead of rebuilding RegExp per ref ([90d3a4f](https://github.com/DavidWells/configorama/commit/90d3a4f58e1be54c12c2f3043507b192506e3fa2))



## 0.9.17 (2026-05-26)


### Bug Fixes

* **passthrough:** only encode current variable, not whole propertyString ([b356c94](https://github.com/DavidWells/configorama/commit/b356c949c0cd19edaf274f9aed497db44f1b00d6))



## 0.9.16 (2026-05-24)


### Bug Fixes

* **dotenv:** silence env loader by default ([262fc3e](https://github.com/DavidWells/configorama/commit/262fc3e1fc3d85da4af4f356d96cbaac3dabe2f6))


### Features

* **errors:** include source line numbers in resolution error messages ([21bf283](https://github.com/DavidWells/configorama/commit/21bf2832438dd1151855fa12214ec424424d604e))
* **parse:** content-based format detection for extensionless files ([8177894](https://github.com/DavidWells/configorama/commit/81778940f329d8a2a7e085783b1217a37f87cef4)), closes [#65](https://github.com/DavidWells/configorama/issues/65)


### Performance Improvements

* cache path join and short-circuit funcRegex ([2744970](https://github.com/DavidWells/configorama/commit/274497002d8acd62c94d8c0f0764eea529255977))
* **cache:** replace unbounded Map caches with BoundedMap ([0917510](https://github.com/DavidWells/configorama/commit/0917510617895ec8c8698ce8808fabc48e80ff46))
* **tracking:** skip metadata-only call tracking when returnMetadata is false ([5b0589c](https://github.com/DavidWells/configorama/commit/5b0589c6c075a3020890b8968102e63c37bc04f7))



## 0.9.15 (2026-04-30)


### Bug Fixes

* guard originalSource type check in populateVariable ([3bd98df](https://github.com/DavidWells/configorama/commit/3bd98df8621c15d653f906a4504ba8024305c199)), closes [#70](https://github.com/DavidWells/configorama/issues/70)



## 0.9.14 (2026-04-30)


### Bug Fixes

* **cli:** write error messages to stderr instead of stdout ([28270b8](https://github.com/DavidWells/configorama/commit/28270b8f231480b762f9ad67b4e24fec38336458))
* **git:** prevent shell injection in git resolvers ([8e1ff47](https://github.com/DavidWells/configorama/commit/8e1ff4732635a44b5f32a6ca423723e347a95492))
* **git:** remove dead return after throw and use execFile for safety ([70c6f9d](https://github.com/DavidWells/configorama/commit/70c6f9da077993888651b6dfe5f0d0cab7dfc122))
* gracefully handle non-git repos in ${git} resolver ([a7bfb10](https://github.com/DavidWells/configorama/commit/a7bfb10ca801b89df62d57410c126513c7460acb)), closes [#68](https://github.com/DavidWells/configorama/issues/68)
* move passthrough detection after historyEntry properties set ([ccc2046](https://github.com/DavidWells/configorama/commit/ccc20461266fb3f1e3719f863e7581bf35ce1b90))
* preserve original error instead of double-wrapping ([17f05e3](https://github.com/DavidWells/configorama/commit/17f05e37fa862ca2101079876ba1907f4997e314))


### Performance Improvements

* **preProcess:** optimize regex compilation and add early exit checks ([0bb28d2](https://github.com/DavidWells/configorama/commit/0bb28d2f6205ee463e659da9ac73061e01481b1e))



## 0.9.13 (2026-01-28)


### Bug Fixes

* **cli:** resolve flag ambiguity and clean error output ([4085d74](https://github.com/DavidWells/configorama/commit/4085d745e08cf163a7d1410042cf528548a0c61f))
* **markdown:** handle CRLF line endings and _content collision ([16eab67](https://github.com/DavidWells/configorama/commit/16eab676db568a1409d18844a130f52f81612739))
* prevent resolved values from being misinterpreted as functions ([a674fa7](https://github.com/DavidWells/configorama/commit/a674fa7ee13071895be3819eeb8188215fecfc70))
* remove removeAllListeners and process.exit from library code ([089662d](https://github.com/DavidWells/configorama/commit/089662d459b278779e8d3b6759c8beb7f16ef0dc))
* **security:** prevent command injection in git timestamp resolver ([e969e4a](https://github.com/DavidWells/configorama/commit/e969e4afae115db94d7810e3b97931361a587574))
* **types:** correct parsePath return type to include number ([f586e68](https://github.com/DavidWells/configorama/commit/f586e680754114296ab565965938a0f8e65a9cbc))


### Features

* add jq-style path extraction to CLI ([#64](https://github.com/DavidWells/configorama/issues/64)) ([ac6a8e5](https://github.com/DavidWells/configorama/commit/ac6a8e587a0f321268f458e463490f8c531bf048))
* add markdown/MDX frontmatter parsing support ([d054e9a](https://github.com/DavidWells/configorama/commit/d054e9ab1512080bfbc78d813a8489bf49907f74))



## 0.9.12 (2026-01-20)


### Bug Fixes

* **types:** use CommonJS-compatible export for CJS/ESM support ([ab413cb](https://github.com/DavidWells/configorama/commit/ab413cbfa86a7c0e0f529ee0f13ca205b7c97490))



## 0.9.11 (2026-01-12)



## 0.9.10 (2026-01-12)


### Bug Fixes

* add JSDoc type annotations for type errors ([ac1c8ef](https://github.com/DavidWells/configorama/commit/ac1c8ef8566a6dc08a1330dfb04d691a6f470953))



## 0.9.9 (2026-01-12)


### Bug Fixes

* check type before toLowerCase on file() arg ([c834b1a](https://github.com/DavidWells/configorama/commit/c834b1a1c51bfaad36c252dfa09b9174f7bfdd27))
* handle escaped backslashes before quotes in splitByComma ([357794e](https://github.com/DavidWells/configorama/commit/357794ec13565ca622ab44588e2ed0e3661e5ad4))
* handle null keyword in eval expressions ([9b810a1](https://github.com/DavidWells/configorama/commit/9b810a1383d59f7261ed1f05f8636efbf623c85d))
* if() edge cases - logical ops, quotes, null, empty conditions ([9d63ed4](https://github.com/DavidWells/configorama/commit/9d63ed4190c2870ff6fc5c47662e78f1344bcddc))
* preserve || logical OR when parsing filter pipes ([2d33786](https://github.com/DavidWells/configorama/commit/2d3378698fb9662e67a76147b6647099f73bde24))
* preserve directory structure in findUp path resolution ([55cd7d4](https://github.com/DavidWells/configorama/commit/55cd7d4c075eb549ab2d3b66906ca46c36c34d46))
* preserve named exports in TS/ESM parsers ([e9d8c19](https://github.com/DavidWells/configorama/commit/e9d8c192a803273ad0c080f8346fa1050aa67378))
* reject empty/whitespace strings in number resolver ([ffce031](https://github.com/DavidWells/configorama/commit/ffce031fc046499dc998f8ee3220d6d4422fa822))
* resolve known vars when allowUnknownVars is true ([7995b30](https://github.com/DavidWells/configorama/commit/7995b30ad9015bbdc54d72c9e35ef39ee23cbc3b))
* respect string boundaries when counting parens in parseFunctionCall ([aad2cd6](https://github.com/DavidWells/configorama/commit/aad2cd651a6aecca4488bf5d38a2e10a5aa630b5))
* **security:** use DEFAULT_SAFE_SCHEMA for CloudFormation YAML ([83a4314](https://github.com/DavidWells/configorama/commit/83a4314d11f96fe915f77f4925e474137c7a9c45))
* use .on() instead of .once() for Windows signal handlers ([4555cf3](https://github.com/DavidWells/configorama/commit/4555cf3bd21b583f4479b8f7d02496435ff09a47))


### Features

* add ${if(...)} syntax as alias for eval ([e01717c](https://github.com/DavidWells/configorama/commit/e01717cc984be0377c1995ba10494d85decd50b9))
* add YAML anchors/aliases test + fix merge with glob patterns ([32d698f](https://github.com/DavidWells/configorama/commit/32d698feb9e33361751737ec673b8654906e8681))
* bare refs in if() + object/array support in ternary ([c5cc950](https://github.com/DavidWells/configorama/commit/c5cc9508a5d6434f0922c94afc9fa442ae99e043))
* function property access with filters + array index access ([38940ff](https://github.com/DavidWells/configorama/commit/38940ffd63d28c880b8e6bd1995f30c64f004de0))
* support multiple filters on function property access ([b41ace9](https://github.com/DavidWells/configorama/commit/b41ace954c7d9db66b9d2e34d7f5db35afbc5867))


### Performance Improvements

* cache compiled regex patterns + use substring over string concat ([5668ffe](https://github.com/DavidWells/configorama/commit/5668ffe31cddbe8b01e4b4dd38035fcd8f1ed74e))



## 0.9.8 (2025-12-17)



## 0.9.7 (2025-12-17)



## 0.9.6 (2025-12-17)


### Features

* Add Terraform HCL file support ([6562a67](https://github.com/DavidWells/configorama/commit/6562a6781332f39768dacc922d1f34e75e3e27d0)), closes [#55](https://github.com/DavidWells/configorama/issues/55)



## 0.9.5 (2025-12-12)



## 0.9.4 (2025-12-11)



## 0.9.3 (2025-12-10)



## 0.9.2 (2025-12-10)



## 0.9.1 (2025-12-10)



# 0.9.0 (2025-12-06)


### Features

* throw on circular variable deps ([f35be0f](https://github.com/DavidWells/configorama/commit/f35be0f05c3f6cd4dcc2af43578d734378ac1340))



# 0.8.0 (2025-12-05)


### Features

* add buildVariableSyntax helper for custom variable delimiters ([affe467](https://github.com/DavidWells/configorama/commit/affe467fcf447c38a5d3207ce305df4b0b82fa22))
* implement ${param} variable resolver ([a0026bd](https://github.com/DavidWells/configorama/commit/a0026bdcf6dc2c929b3b5c3ae57b993d0502ad28)), closes [#49](https://github.com/DavidWells/configorama/issues/49)



## 0.7.2 (2025-12-02)



## 0.7.1 (2025-12-02)



# 0.7.0 (2025-12-02)



## 0.6.19 (2025-12-02)



## 0.6.18 (2025-12-02)



## 0.6.17 (2025-12-02)



## 0.6.16 (2025-12-01)



## 0.6.15 (2025-12-01)



## 0.6.14 (2025-11-30)


### Features

* add custom filePath overrides ([9876bc8](https://github.com/DavidWells/configorama/commit/9876bc8083185d82a585adf537d16410a20b796d))



## 0.6.13 (2025-11-29)


### Features

* Add period support to ${file} var sub key paths ([4ec2a9d](https://github.com/DavidWells/configorama/commit/4ec2a9d4079b1a2fafcc3b3634d165f64ec3d31f))



## 0.6.12 (2025-11-28)



## 0.6.11 (2025-11-27)



## 0.6.10 (2025-11-27)



## 0.6.9 (2025-11-18)



## 0.6.8 (2025-11-18)


### Features

* add returnMetadata option to expose variable information programmatically ([69c82f4](https://github.com/DavidWells/configorama/commit/69c82f47b5ca5c198cd2211426a261f56abd9ca0)), closes [#37](https://github.com/DavidWells/configorama/issues/37)



## 0.6.7 (2025-10-10)


### Bug Fixes

* ignore giant text blocks for functions ([b2af118](https://github.com/DavidWells/configorama/commit/b2af118950d207bfc89b679ecd74b94276d947dd))



## 0.6.6 (2025-10-10)


### Features

* add raw text resolver ([4d9f151](https://github.com/DavidWells/configorama/commit/4d9f1517fe38e4cb5987e5754f1f0affce0e4018))



## 0.6.5 (2025-09-28)


### Features

* add ${cron:} variable resolver for human-readable cron expressions ([323bbac](https://github.com/DavidWells/configorama/commit/323bbac1efd7b410358eda142cf5b709a59df94b)), closes [#16](https://github.com/DavidWells/configorama/issues/16)
* add alias support for file variables ([64c83f6](https://github.com/DavidWells/configorama/commit/64c83f6eb728c14fd50c8a3acf98a1c86ade0a2c))
* Add comprehensive TypeScript support for variable validation ([f20495a](https://github.com/DavidWells/configorama/commit/f20495affc3013d9973763b533fd9ed55fa0b9b9)), closes [#29](https://github.com/DavidWells/configorama/issues/29)
* Add ESM support for config resolution and variable file refs ([b817d7a](https://github.com/DavidWells/configorama/commit/b817d7a0746155ef3f4108d9f9d96abcf25e7121)), closes [#31](https://github.com/DavidWells/configorama/issues/31)
* add eval resolver for safe boolean expressions ([879eac4](https://github.com/DavidWells/configorama/commit/879eac4c1acbda85d80d78a3323667954b576168)), closes [#14](https://github.com/DavidWells/configorama/issues/14)
* add INI parser with comprehensive tests ([e883bc5](https://github.com/DavidWells/configorama/commit/e883bc558239335679b535b07e5178302096b60f)), closes [#4](https://github.com/DavidWells/configorama/issues/4)
* add script to run tests in isolation and update package.json ([a5c8075](https://github.com/DavidWells/configorama/commit/a5c80759c98c6b683992c462e69592cd72b5e9f9))
* add tests and configuration for preprocesser functionality ([89e3a7f](https://github.com/DavidWells/configorama/commit/89e3a7f66c940b01ff5e56174d07ac4dc79d7dfc))
* add TypeScript support for file resolution ([7b0a2cd](https://github.com/DavidWells/configorama/commit/7b0a2cd0e11815d4516052b07f35634dbec4ce40))
* update cron variable syntax and enhance tests ([34374a5](https://github.com/DavidWells/configorama/commit/34374a541023f0825430cc117d90e88409acc361)), closes [#16](https://github.com/DavidWells/configorama/issues/16)



## 0.6.4 (2025-05-26)



## 0.6.3 (2025-05-25)



## 0.6.2 (2025-04-23)


### Features

* add debug ([f24f3c9](https://github.com/DavidWells/configorama/commit/f24f3c9568e74401360b369b51cb7978218a1adb))



## 0.6.1 (2025-03-30)



# 0.6.0 (2025-03-30)


### Features

* list config var flag ([b8729ce](https://github.com/DavidWells/configorama/commit/b8729ce86ff48df495bf99f397fa9e0c4a066519))



## 0.5.7 (2025-03-30)



## 0.5.6 (2025-03-30)


### Features

* ignore known !sub refs ([569214b](https://github.com/DavidWells/configorama/commit/569214b910fdf1accbe9ca4b231a0defca1b91c1))



## 0.5.5 (2025-03-29)


### Features

* add debug logger via verbose flag ([bad7813](https://github.com/DavidWells/configorama/commit/bad7813baba85da1e1a9ce883c4141e88895030f))



## 0.5.4 (2025-03-21)


### Features

* add vebose logging flag to cli ([abf2dcd](https://github.com/DavidWells/configorama/commit/abf2dcd2eeed7444225caf2ae2483440ea3e1c3e))



## 0.5.3 (2025-03-20)


### Features

* add deep fallback recursion ([3b7785a](https://github.com/DavidWells/configorama/commit/3b7785a2cdad933fedf681c2d9178433627db7ed))
* support unquoted fallback values ([07a2148](https://github.com/DavidWells/configorama/commit/07a214892c85087fcf3dc6777efd819d6e19bd1f))



## 0.5.2 (2025-03-11)



## 0.5.1 (2025-03-11)



# 0.5.0 (2025-03-11)


### Bug Fixes

* throw if nested var key is an object ([bc587c6](https://github.com/DavidWells/configorama/commit/bc587c65dd22b57354c1954541b5d8601df7a578))


### Features

* add git timestamp variable and fix filters ([0f47358](https://github.com/DavidWells/configorama/commit/0f473582d8fb0877883aefcb1667cacaecfe74b9))
* throw on unknown env key path ([862987c](https://github.com/DavidWells/configorama/commit/862987cd8277785ef7f6598da8fcbced20c65e7e))



## 0.4.10 (2025-01-28)


### Features

* ignore apig stageVariables ([0e9aeac](https://github.com/DavidWells/configorama/commit/0e9aeac2ef52894828e74ea19aee02b2e372961f))



## 0.4.9 (2024-04-18)



## 0.4.8 (2024-02-19)


### Features

* improve yaml array and object parsing ([ee6f9e4](https://github.com/DavidWells/configorama/commit/ee6f9e410756bffd20c3e86411d2ae52ec9a3ead))



## 0.4.7 (2024-02-19)


### Bug Fixes

* string check ([2f144fc](https://github.com/DavidWells/configorama/commit/2f144fc0df7c093d93b530ea9c2e69811fcd62ca))



## 0.4.6 (2024-02-11)


### Features

* add ${git:dir} for direct github sub paths ([17dd0e0](https://github.com/DavidWells/configorama/commit/17dd0e08856eb1b62758236936b6aadd0f68d585))



## 0.4.5 (2024-02-09)


### Features

* enhance ${git} variable ([aea193b](https://github.com/DavidWells/configorama/commit/aea193bd91651006767ecbbfbe243d6b53d0c897))



## 0.4.4 (2024-02-08)


### Bug Fixes

* allow for self references to have fallback default values ([eba8fbb](https://github.com/DavidWells/configorama/commit/eba8fbb78bbe96d76ccbc77e6b5dd409258cc7a1))



## 0.4.3 (2024-02-07)



## 0.4.2 (2024-02-07)



## 0.4.1 (2024-02-07)


### Features

* support single and double quote file syntax ([fbe9077](https://github.com/DavidWells/configorama/commit/fbe90773e58b437efc59f04aa045b66c83765e6d))



# 0.4.0 (2023-03-25)


### Bug Fixes

* update passthrough parser to account for postfixes & long strings ([6ebaaa3](https://github.com/DavidWells/configorama/commit/6ebaaa345a49679e463977131f4b6797f231e378))



## 0.3.9 (2020-09-18)



## 0.3.8 (2020-09-18)



## 0.3.7 (2020-09-18)


### Features

* add cloudformation ref support ([97756a1](https://github.com/DavidWells/configorama/commit/97756a12632f0fe19fc59798f316929567c39f61))



## 0.3.6 (2019-10-19)



## 0.3.5 (2019-10-14)



## 0.3.4 (2019-10-01)



## 0.3.3 (2019-10-01)



## 0.3.2 (2019-10-01)


### Features

* add allowUndefinedValues option ([30197d6](https://github.com/DavidWells/configorama/commit/30197d632de343f1bd2ad5a40a7ee7939009199f))



## 0.3.1 (2019-09-17)


### Bug Fixes

* add finally shim for node 8 ([c23d4e9](https://github.com/DavidWells/configorama/commit/c23d4e9319753b1d4b13d3585da69740f8ed89b7))



# 0.3.0 (2019-08-21)



# 0.2.0 (2019-08-21)



# 0.1.0 (2019-08-21)


### Bug Fixes

* update fallback logic ([8e203a8](https://github.com/DavidWells/configorama/commit/8e203a85016a5844d0d3da8061b540d03e447d58))



## 0.0.9 (2019-08-20)



## 0.0.8 (2019-04-17)



## 0.0.7 (2019-04-16)



## 0.0.6 (2019-04-15)



## 0.0.5 (2019-04-15)



## 0.0.4 (2018-09-19)



## 0.0.3 (2018-09-18)



## 0.0.2 (2018-09-18)





# Changelog

All notable changes to configorama. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not strictly follow SemVer at `0.x`, so minor and patch bumps may contain mixed work until 1.0.

## Unreleased

### Added
- **1Password plugin** at `plugins/onepassword/` resolving config values through the `op` CLI. Alias refs (`${op:npm.NPM_TOKEN}`), direct function syntax (`${op(op://vault/item/field)}`, item IDs/names, private item links), INI/dotenv key paths into secure notes, and field inference with ambiguity-is-an-error semantics (never silently prefers `notesPlain` over `password`). Marked `sensitive: true` / `risk: 'remote_secret_read'`; secrets are fetched at resolution time, never persisted or logged by the plugin. No npm dependencies — requires the `op` binary on `PATH`. Works through both async `configorama()` and `configorama.sync()`.
- **`syncFactory` variable-source contract** in `src/sync.js`: plugins can carry a `syncFactory` path plus JSON-serializable `syncOptions`, which the sync worker rebuilds into a real resolver. The worker now also runs the `collectMetadata` loop so plugin metadata (e.g. `opReferences`) reaches `configorama.sync()` callers with `returnMetadata: true`.
- **Bundled-plugin subpath exports**: `require('configorama/plugins/cloudformation')` and `require('configorama/plugins/onepassword')` now resolve from an installed package (previously the documented CloudFormation subpath did not work). `files` publishes `plugins/` while excluding plugin tests, examples, and nested `node_modules`.

### Changed
- `configorama.audit()` reports a specific high-severity `remote_secret_read` finding (with `sensitive: true`) for custom resolvers that self-describe as sensitive, instead of the generic `custom_extension` message. Plain custom resolvers are unchanged.

### Docs
- README gains a 1Password entry in Bundled Plugins; full plugin docs at `plugins/onepassword/README.md`.

## [0.10.0] — 2026-05-27

### Added
- **Multi-account CloudFormation plugin** at `plugins/cloudformation/` with the `${cf(account:region):stack.Output}` syntax. The `account` field is an env-var-prefix alias (e.g. `prod` matches `PROD_AWS_ACCESS_KEY_ID`). Refcounted mutex serializes different-account resolves while allowing same-account ones to run in parallel. Includes 13 unit tests for the resolver and 13 for the credentials utility. Closes #57.
- `scripts/bench.js`: reproducible multi-fixture resolve benchmark, accepts a lib path so you can A/B test branches or versions.
- `PERF.md` documenting the A/B comparison against `0.9.17` (~5% mean reduction across the five-fixture workload).

### Changed
- Resolution loop is now ~5% faster on a representative workload. The seven changes:
  - `getProperties` skips paths already known to be fully resolved on subsequent populate iterations.
  - `getProperties` walks the path array directly on cache miss instead of O(depth²) repeated `dotProp.get(joined-string)` calls.
  - The post-resolve config walk no longer goes through the `traverse` package; uses a native pre-order recursion (skips sparse-array holes to preserve previous behaviour).
  - `populateVariables` filter uses a precomputed `hasVar` flag instead of re-running the variable-syntax regex per leaf per iteration.
  - Boolean `.match()` checks on `this.variableSyntax` (a `/g` regex) replaced with `.test()` on a non-global twin; avoids allocating a match-array just to discard it.
  - `rawOriginalConfig` is now lazy-cloned only when a metadata consumer (`returnMetadata`, `--verbose`, `--info`, `returnPreResolvedVariableDetails`, setup mode) actually needs it.
  - `preProcess.js` reuses the precompiled `precededByPatterns` array in the second comparison-context pass instead of rebuilding the regex per `${…}` ref.
- `valueFromFile` resolver now caches `readFileSync` per absolute path per Configorama instance. Duplicate `${file:…}` references (common with merge-keys patterns) hit the disk once.
- `plugins/cloudformation/` lockfile refreshed to pull AWS SDK ≥ 3.972 (clears seven Dependabot alerts on `fast-xml-parser`).
- Dev dep `markdown-magic` bumped `^3.4.0` → `^4.8.0`. README `npm run docs` script updated to pass `{ open: 'doc-gen', close: 'end-doc-gen' }` since v4 changed the default comment-block keywords.
- Added an `overrides` clause forcing transitive `lodash` to `^4.18.1` (patches prototype-pollution + `_.template` code-injection alerts).

### Fixed
- `npm run docs` was silently no-op'ing after the markdown-magic v4 bump (it found "0 transforms" because the default open/close changed). Fixed by passing the custom `open`/`close` explicitly.

### Docs
- README refreshed: bumped Node 18 → 22 across CI/Docker/serverless examples; bumped `actions/checkout`/`setup-node` `@v3` → `@v4`; replaced `aws-sdk` v2 (in EoL) with `@aws-sdk/client-ssm` v3 in all examples; removed the dead `CONTRIBUTING.md` link; removed the GitHub Discussions link (Discussions is not enabled).
- README documents the bundled CloudFormation plugin (new "Bundled Plugins" section + links from the Custom Variable Sources and Multi-Stage Resolution sections that previously claimed CF required an external resolver).
- README documents previously-undocumented public API: `useDotEnvFiles`, `dotEnvSilent`, `dotEnvDebug`, `returnPreResolvedVariableDetails`, `dynamicArgs`, `buildVariableSyntax()`, the `Configorama` class, the `configorama/parse-file` subpath, and the TypeScript types.
- README fixes a pre-existing bug: `format.json5.parse` → `format.json.parse` (the JSON parser handles JSON5 syntax internally; there was never a `json5` key).
- README fixes a pre-existing bug: markdown body is exposed as `_content`, not `_body`.
- "What's New" prose list converted to a feature-comparison table vs Serverless Framework variables. "Alternative Libraries" converted to a feature matrix.
- Added an ASCII architecture diagram and a Performance subsection linking `PERF.md`.

---

## [0.9.17] — 2026-05-25

### Fixed
- `passthrough` encoding now only encodes the current variable instead of the whole `propertyString`.

## [0.9.16] — 2026-05-23

### Added
- Source line numbers included in resolution error messages, so the offending config location is easier to track down.
- Content-based format detection for extensionless files.
- Test fixture for `serverless analyze`.

### Changed
- `dotenv` env loader is now silent by default (use `dotEnvSilent: false` to restore previous chatter).
- Replaced unbounded `Map` caches with `BoundedMap` to prevent runaway memory on long-lived processes.
- Extracted `collectVariableMetadata` into its own `src/metadata.js` module.
- Extracted CLI display formatting from `init()` into `src/display.js`.

### Performance
- Cached `path.join` and short-circuited `funcRegex` matching.
- Skips per-call metadata tracking when `returnMetadata` is false.

## [0.9.15] — 2026-04-30

### Fixed
- Guarded `originalSource` type check in `populateVariable` against non-string values.

## [0.9.14] — 2026-04-30

### Fixed
- CLI error messages now go to stderr instead of stdout.
- `${git:…}` resolver uses `execFile` instead of `exec` (no shell), preventing command injection via malicious git output. Also removed dead post-throw `return` statement.
- Preserve original error instead of double-wrapping on rethrow.
- Passthrough detection moved after `historyEntry` properties are set.
- `${git:…}` resolver now gracefully handles non-git repos (returns undefined instead of throwing).

### Changed
- File-header docs and simplified `valueFromOptions` resolver.

### Performance
- `preProcess` regex compilation moved out of hot loops; added early-exit checks.

### Docs
- First full README rewrite covering all use cases.

## [0.9.13] — 2026-01-27

### Added
- Markdown / MDX frontmatter parsing.
- `jq`-style path extraction in the CLI (`configorama config.yml .database.host`).

### Fixed
- Removed `process.exit` and `removeAllListeners` from library code (these are CLI-only concerns).
- Resolved CLI flag ambiguity and cleaned up error output.
- Markdown parser handles CRLF line endings and `_content` collision with frontmatter keys.
- `${git:…}` timestamp resolver no longer vulnerable to command injection.
- Resolved values are no longer misinterpreted as function calls when they happen to look like one.
- TypeScript types corrected for `parsePath` to include `number` in the return type.

### Changed
- Replaced 15 micro-package lodash dependencies with native JS equivalents (smaller install size, fewer transitive deps).
- Removed debug code and the `promise.finally` shim (Node 12+ has native support).

## [0.9.12] — 2026-01-12

### Fixed
- TypeScript declaration file now uses CommonJS-compatible export for CJS/ESM interop.

### Added
- Edge-case test coverage for nested variable resolution.

## [0.9.11] — earlier

- See `git log v0.9.10..v0.9.11` for details (single fix release: JSDoc type annotations).

## [0.9.10] — earlier

- See `git log v0.9.9..v0.9.10` for details (single fix release: type errors).

## [0.9.9] — earlier

### Added
- `${if(…)}` syntax as an alias for `${eval(…)}`.
- Bare refs in `if()` conditions; object/array support in ternary branches.
- Multiple filters on function-property access (`${fn(...).foo | filter1 | filter2}`).
- Function property access combined with array index access.
- YAML anchors/aliases handling and merge-with-glob fix.

### Fixed
- `if()` edge cases: logical operators, quotes, null, empty conditions.
- Resolves known vars even when `allowUnknownVars` is true.
- `null` keyword handling in `eval` expressions.

### Performance
- Cached compiled regex patterns; replaced repeated string concatenation with `substring` slices.

### Changed
- Extracted quote-aware string utilities into reusable helpers.

---

## Before 0.9.9

Older releases predate this changelog. For history, see `git log v0.8.0..v0.9.8`.

[0.10.0]: https://github.com/DavidWells/configorama/releases/tag/v0.10.0
[0.9.17]: https://github.com/DavidWells/configorama/releases/tag/v0.9.17
[0.9.16]: https://github.com/DavidWells/configorama/releases/tag/v0.9.16
[0.9.15]: https://github.com/DavidWells/configorama/releases/tag/v0.9.15
[0.9.14]: https://github.com/DavidWells/configorama/releases/tag/v0.9.14
[0.9.13]: https://github.com/DavidWells/configorama/releases/tag/v0.9.13
[0.9.12]: https://github.com/DavidWells/configorama/releases/tag/v0.9.12
