# Query-string compatibility boundary

Expo Router 6 loads `query-string` as a CommonJS object with named methods. The patched 9.5.1 library is an ES module with a default API object. This small local package exposes that same API object to the existing consumer and delegates all parsing/stringification to the unmodified, pinned upstream library.

`query-string-modern` is an npm alias of upstream `query-string@9.5.1`; its patched `decode-uri-component` dependency remains visible to npm audit. No parser implementation, advisory exclusion or vendored decoder is maintained here. The override is scoped to Expo Router; this is not an SDK/native-platform upgrade.

The app must run on its supported Node runtime for tooling. Metro/Babel handles the same boundary for native bundles. Keep the direct method-export and URL round-trip/hostile-input tests, EAS/profile checks, normal Jest/typecheck acceptance and both Metro exports green when updating either side.

Once an SDK-compatible Router release consumes the patched upstream API directly, remove this boundary and its direct dependency/override together after repeating those checks. Do not remove it merely to silence peer or audit diagnostics.
