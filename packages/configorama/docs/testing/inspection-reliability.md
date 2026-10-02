# Inspection and runtime provenance

`analyze` reports the authored expression's complete reference occurrences. Each
occurrence retains UTF-16 start/end spans, its raw reference, parent node,
annotation role, ownership, filters, path segments and reversible path identity.
Its occurrence ID encodes the path identity and spans; equal text at different
config destinations remains distinct. Discovery uses declared prefixes and regex
source descriptors. It does not invoke custom matcher, resolver, function or
filter callbacks. Executable root configs retain their existing loading rules;
safe inspection blocks those entry points.

`discovery: 'static-possible'` describes a dependency that might be used.
`defaultAvailability` is `guaranteed` for a syntactic literal fallback without
filters, `conditional` for dynamic/variable/file fallbacks or filters, and `none`
when there is no fallback. These additive fields accompany the existing default,
required and type fields. A legacy optional classification does not promise that
a conditional default will resolve or that a filter cannot throw. Inspection
does not execute a filter to establish its output type.

For example `${env:X, "literal"}` has a guaranteed default;
`${env:X, env:Y}` and `${env:X, file(missing.yml)}` are conditional.
`${env:X, "literal" | Number}` remains conditional because conversion can fail.
Graph `possible` edges carry occurrence identity and item position. Audit retains
possible executable/file dependencies, including a bare fallback call, even when
an earlier runtime branch would win. Dynamic file targets produce partial-edge
diagnostics; inspection does not run code to discover their targets.

With returnMetadata, runtime fallback selections record selected, skipped and
missing slots. Authored occurrences carry the selected branch when it can be
matched to that execution record. Other runtime outcomes are `unobserved`; static
analysis alone reports `unknown`. Rewritten references are not given invented
execution results. `fileDependencies.selectedReferences` separately records real
runtime file selections, authored origin, lexical/canonical target and selection
reason. Static fileDependencies describe possible reads.

`tests/reliability/inspection.test.js` checks custom wrappers, original spans,
separate destinations, conditional defaults, branch risks, runtime choices and
real CLI/API non-execution sentinels. The conformance graph golden intentionally
adds occurrence-specific possible edges; deployment output goldens remain exact.
