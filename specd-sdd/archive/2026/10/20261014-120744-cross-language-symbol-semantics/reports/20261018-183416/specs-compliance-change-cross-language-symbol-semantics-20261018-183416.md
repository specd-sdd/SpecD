# Compliance report — cross-language-symbol-semantics (full verification)

Mode: change. Scope: the 16 specs of the change (140 delta scenarios; 119 distinct after
removing rename artifacts), checked against code and tests. Method: three independent
read-only reviewers (groups A/B/C), plus full-repo build, typecheck, eslint and test runs
(all green: code-graph 1191, cli 1142, sdk 120, core 2526 tests).

Caveat: the graph index was stale at audit time (indexed at 906aa0e1, uncommitted work not
reflected), so reviewers navigated by reading code. Global-spec consistency was not audited
as a separate pass.

## Totals

PASS 95 · FAIL 1 · UNVERIFIED 23 (no red tests).

## FAIL

1. python-language-adapter / "Imported Python base retains provenance": the spec requires
   the base-expression range; `createImportedHierarchyMetadata`
   (reference-fact-helpers.ts:204) stores the child declaration range, and the test pins
   that range. Applies to TS and PHP imported hierarchy too. Either code+tests change or the
   spec wording ("parser range") must be loosened.

## Real implementation gap

2. sdk/run-graph-impact / "Export and covering-spec locations are projected": the public
   export branch (`mapImpactDetail`) drops `coveringSpecs`, so export results neither
   surface nor project covering-spec evidence. Fix code, or amend the spec.

## Spec/code drift

3. code-graph/composition barrel: the test allow-list names runtime exports that the spec
   does not enumerate (createLogicalSymbol, createPublicBinding, createLocalBinding,
   parseLogicalSymbol, normalizeFileSelectorPath, FILE_CATEGORIES, classifyFileCategory,
   SymbolSpace, MemberKind, FreshnessMode, ...). Extend the spec list or trim the test.
4. graph-store / "Persisted file content is not a file result category": search still has a
   live `files` category; intent unclear, no test.

## UNVERIFIED (code looks right, no covering test)

- Manifest isolation (no source facts from manifests): language-adapter auxiliary manifest,
  python pyproject, go go.mod, php composer.
- language-adapter "Parser cannot prove a construct" (no erroneous-source test).
- typescript: call initializer stays a variable; multiline imports/types/heritage lookalikes.
- php: method-local binding is not the caller; compact declarations; brace-scan lookalikes.
- traversal: reached declarations mapped/deduplicated before one coverage batch; shallowest
  depth across two depths untested.
- graph-store: physical-only declaration id stays retrievable.
- sqlite-graph-store: physical-only declaration persists no occurrence form.
- indexer: FileNode.projectRelativePath, and `../..` traversal case.
- staleness-detection: two-contender stale-lock race (code uses atomic rename).
- cli: "declaration impact" label for exact selectors; structured output with non-empty
  semanticAffectedTargets.

## Weak tests noted

- symbol-reference.spec "Identity layers" tests (overload movement, physical-only,
  competing scopes) are tautological (hand-built objects).
- The PHP spec was rebuilt after an accidental `git checkout` discarded earlier uncommitted
  tests; coverage there may be below the original.
