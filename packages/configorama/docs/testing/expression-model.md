# Shared expression syntax

The scanner reads source text without resolving values or invoking plugins. Offsets are UTF-16 indexes into the original string, with exclusive ends. Nodes have stable integer IDs and parent IDs, raw source, kind and complete status. Parent IDs avoid cyclic objects. The result and its node/diagnostic arrays are immutable. A configured prefix/suffix defines the wrapper independently of environment or options; matching quotes follow odd/even backslash escape rules after the file format has already decoded its own lexical escapes.

Reference nodes retain all nested references, including references in quoted composition. A reference owns its top-level comma fallback slots and single-pipe filters; `||`, quoted delimiters and delimiters inside nested wrappers, calls, arrays or objects do not split it. Call nodes retain balanced parentheses and argument boundaries. Literal, composition, argument, fallback and filter projections refer to the same original spans. File/text path arguments may contain literal braces: a consumer can choose their path projection without treating those characters as new variable wrappers. Text outside a variable wrapper, including VTL calls, remains caller-owned text in the preprocessing projection.

`${env:X}` is a reference even if X is absent. `${env:X, "sl-${sls:stage}"}` includes a quoted composition with a nested reference; source ownership decides whether that reference resolves. `${merge("foo()", "x")}` has two literal arguments and no call inside the quoted string. `#set($m = {"x": 1})` is external code unless its owner explicitly asks for call discovery.

Malformed fragments retain their original spans and produce sanitized diagnostics rather than fabricated values. Scanner visits and active syntax depth count toward the load's existing deterministic budgets. Resolution owns value types, lazy fallback selection, filters, recognized sources and ignore-path policy. Preprocessing owns projections that protect literal characters and JSON arguments. Metadata/static discovery owns an occurrence projection, never another evaluator. The shared ownership matrix in `tests/reliability/ownershipCorpus.js` is the compatibility source for all three consumers. Public lookup grammar is unchanged.

Identical source/wrapper scans reuse immutable nodes within one load. Each lookup
still checks the load budget; different syntax protection settings use separate
entries. This keeps ordinary long fallback lists within the default work bound
without sharing syntax state across callers or raising the limits.
