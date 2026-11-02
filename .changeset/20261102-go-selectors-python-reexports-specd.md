---
'@specd/specd': minor
---

20261102 - go-selectors-python-reexports: Go package-qualified selectors such as pkg.Name now resolve to exported symbols, producing CALLS, CONSTRUCTS, and USES_TYPE edges through an optional qualified-reference fact. Python package entries publish statically provable re-export routes from **init**, including a static **all** filter, so from package import Name reaches the declaring symbol. Persisted IDs and the other language adapters stay unchanged.

Modified packages:

- @specd/code-graph

Specs affected:

- `code-graph:go-language-adapter`
- `code-graph:python-language-adapter`
- `code-graph:symbol-model`
- `code-graph:language-adapter`
