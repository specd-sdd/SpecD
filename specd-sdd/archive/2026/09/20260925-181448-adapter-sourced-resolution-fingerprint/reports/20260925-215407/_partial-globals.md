# Global and depth-1 conformance

Change: `adapter-sourced-resolution-fingerprint`. Read-only audit of the working tree. Specs were read with `node packages/cli/dist/index.js specs show <specId> --format text`. Symbols were located with `graph search`. Only constraints this fingerprint port, composition wiring, and Python-identity declaration can violate were scored. Historical `node:fs` use in indexing, content freshness, and `getPackageIdentity` was not re-audited.

`code-graph:composition` is a real spec id. Wiring evidence is `packages/code-graph/src/composition/create-code-graph-provider.ts`.

## Spec: default:\_global/architecture

### Constraint checked

Application layer interacts with the outside world only through ports. `application/` does not import `infrastructure/`. Filesystem reads for resolution manifests go through `ResolutionManifestSource`.

### Status

conformant

### Evidence

`packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` imports `ResolutionManifestSource` and `emptyResolutionManifestSource` from `application/ports/resolution-manifest-source.ts`. It does not import `node:fs`. `discoverResolutionInputs` calls `source.directoryExists`, `source.isRegularFile`, and `source.readText`. `hashManifestText` hashes `source.readText`. Private `normalizeNewlines` only rewrites line endings.

`IndexCodeGraph` takes `manifestSource` in its constructor (`index-code-graph.ts` around the constructor) and passes `this.manifestSource` into fingerprint helpers. `GetGraphHealth` passes `input.manifestSource ?? emptyResolutionManifestSource` into `detectFingerprintMismatch`. Neither application file imports `NodeResolutionManifestSource`.

`node:fs` remains in `index-code-graph.ts` and `get-graph-health.ts` for staging, content hashing, and indexed-file reads. Those calls are outside the new manifest-fingerprint path and were not scored.

### Constraint checked

Ports with shared constructor arguments are abstract classes; port operations are methods, not property signatures. Concrete adapters are constructed in composition and are not exported from public entry points. Delivery hosts do not take a direct `@specd/code-graph` dependency to reach a warning string.

### Status

conformant

### Evidence

`ResolutionManifestSource` has no invariant constructor arguments. It is an `interface` whose members are method signatures (`directoryExists`, `isRegularFile`, `readText`), not property signatures.

`NodeResolutionManifestSource` is constructed only in `create-code-graph-provider.ts` and passed into `new IndexCodeGraph(store, registry, manifestSource)` and into the health execute input. `packages/code-graph/src/public.ts` and `src/index.ts` do not export it. `package.json` `exports` are `"."` → `public.js` and `"./internal"` → `index.js`.

`packages/cli/package.json` depends on `@specd/sdk` and does not declare `@specd/core` or `@specd/code-graph`. `packages/cli/src/commands/graph/stats.ts` prints the warning only when `health.fingerprintMismatch === true`. It does not recompute the digest. The literal matches `GRAPH_STATS_FINGERPRINT_WARNING` in `compute-graph-fingerprint.ts`. That copy stays in the CLI because the host must not depend on `@specd/code-graph`. The mismatch decision stays in `GetGraphHealth`.

### Constraint checked

Domain stays free of I/O. Python package identity for fingerprint discovery is a basename declaration, not a domain or application filesystem read. Manual composition wires the adapter. No new YAML boundary and no new package cycle.

### Status

conformant

### Evidence

`LanguageAdapter.resolutionManifests()` is documented as I/O-free and returns exact basenames. `PythonLanguageAdapter.resolutionManifests()` returns `['pyproject.toml']`. `[project].name` parsing stays in infrastructure (`readPythonProjectName` / `findManifestField` in `python-language-adapter.ts` and `find-manifest-field.ts`). The fingerprint path hashes newline-normalized manifest text through the port and does not parse TOML in application or domain code.

`createGetGraphHealth()` still returns `new GetGraphHealth(createVcsAdapter)` with no captured config. The provider spreads a composition-built input into `execute` and adds `provider: this`.

## Spec: default:\_global/testing

### Constraint checked

Application-layer unit tests mock ports and do not touch the filesystem. Infrastructure adapter tests use a real temporary directory.

### Status

discrepancy

### Evidence

`default:_global/testing` requires unit tests of application code to mock ports and forbids filesystem access in those tests. Filesystem access belongs in infrastructure integration tests.

These files live under `packages/code-graph/test/application/use-cases/` and call `mkdtempSync(join(tmpdir(), ...))`, `mkdirSync`, and `writeFileSync`, then pass `new NodeResolutionManifestSource()`:

- `compute-graph-fingerprint.spec.ts`: `given adapter declares package.json, when that file changes, then fingerprint changes`; `given LF and CRLF of the same package.json, when hashed, then digests match without sha256 prefix`; `given undeclared tsconfig.json, when it changes, then fingerprint stays the same`; `given composer.json between codeRoot and repoRoot, when declared, then it is included`; `given a declared manifest above repoRoot, when discovered, then it is omitted`; `given repoRoot null, when a manifest is above projectRoot, then it is omitted`; `given a directory named like a manifest, when discovered, then it is omitted`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

`filesSource` in `compute-graph-fingerprint.spec.ts` is an in-memory `ResolutionManifestSource` and is never called. The CRLF digest case uses the Node adapter instead.

The newline indexer case is the exception that meets the port rule: `workspace-indexing.spec.ts` (`given a declared manifest changes only newlines, when indexing again, then fullRebuildReason stays null`) builds an in-memory `ResolutionManifestSource` and passes it to `new IndexCodeGraph(store, registry, source)`.

The infrastructure test meets the integration rule: `test/infrastructure/fs/node-resolution-manifest-source.spec.ts` uses `mkdtempSync(join(tmpdir(), ...))`, removes the directory in `afterEach`, and exercises `NodeResolutionManifestSource` against real files.

Application fingerprint cases do remove their directories with `rmSync` in a `finally` block, use `os.tmpdir()`, and do not hardcode `/tmp` or `chmod 0o000`. Cleanup and Windows path rules are met. They do not turn those cases into application unit tests.

### Constraint checked

Behaviour-test titles use `given <state>, when <action>, then <outcome>`. Runner is Vitest. No snapshots. No `as unknown as` port casts.

### Status

discrepancy

### Evidence

These new behaviour titles do not use that pattern:

- `compute-graph-fingerprint.spec.ts`: `computeGraphFingerprint includes adapters and repoRoot`
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh`
- `staleness-detection.verify.spec.ts`: `Scenario: Edited resolution manifest is a derivation mismatch`

The other new fingerprint titles in that file do use `given …, when …, then …`, as do both cases in `node-resolution-manifest-source.spec.ts`.

No `toMatchSnapshot`, `toMatchInlineSnapshot`, Jest import, or `as unknown as` port cast in those application tests. The in-memory indexer source implements all three port methods without a cast.

## Spec: default:\_global/eslint

### Constraint checked

No explicit `any`, no default exports, explicit return types on exported functions and methods, JSDoc on functions and classes, kebab-case `src/` names, and layer `no-restricted-imports` boundaries.

### Status

conformant

### Evidence

`resolution-manifest-source.ts`, `node-resolution-manifest-source.ts`, and `compute-graph-fingerprint.ts` use named exports, kebab-case names, and explicit return types on exported functions and class methods. `normalizeNewlines`, `hashManifestText`, and `collectResolutionBasenames` are internal functions with JSDoc (`@param` / `@returns`). Port methods and `NodeResolutionManifestSource` methods have JSDoc. No `: any`, `as any`, or `export default` in those files.

`jsdoc/require-jsdoc` contexts are `FunctionDeclaration`, `ClassDeclaration`, `MethodDefinition`, `TSTypeAliasDeclaration`, and `TSInterfaceDeclaration`. Object-literal methods on `emptyResolutionManifestSource` sit outside those contexts. The interface methods they implement are documented.

Application fingerprint code does not import `infrastructure/` or `composition/`. Composition is the file that imports `infrastructure/fs/node-resolution-manifest-source.ts`. Test files are exempt from JSDoc.

## Spec: default:\_global/conventions

### Constraint checked

ESM named exports, kebab-case tests under `test/`, no `any`, explicit public return types, `SpecdError` for expected domain or application failures, and `readonly` on new fingerprint values. Collection lazy-loading does not apply to an explicit content hash.

### Status

conformant

### Evidence

New modules are ESM TypeScript with named exports. Tests are `*.spec.ts` under `test/`, mirroring `src/`. `ResolutionInputFingerprint` and `GraphFingerprintInput` use `readonly`. `normalizeNewlines` is a private function in `@specd/code-graph`, not an export of `@specd/core`.

Unreadable manifests return `undefined` from `NodeResolutionManifestSource.readText` and are omitted by `hashManifestText`. That path does not throw a generic `Error` or a new `SpecdError`. No new error class was added.

`node:path` and `node:crypto` in the fingerprint helper are not filesystem I/O. Hashing declared manifest text is an explicit load, not a collection `list()` that embeds content.

## Spec: code-graph:get-graph-health

### Constraint checked

`createGetGraphHealth()` returns a stateless instance with no config capture. Derivation comparison uses the already-open provider, does not open or close it, and sets `fingerprintMismatch` to `null` when comparison cannot run. The new manifest port is an execute input, not a second factory.

### Status

conformant

### Evidence

`packages/code-graph/src/composition/use-cases/get-graph-health.ts`: `createGetGraphHealth()` returns `new GetGraphHealth(createVcsAdapter)` and takes no config or manifest source.

`GetGraphHealthInput.manifestSource` is optional. `execute` calls `detectFingerprintMismatch` only when `input.workspaces !== undefined && stats.graphFingerprint !== null`, and the `catch` sets `fingerprintMismatch = null`. The provider passes the composed input, including `manifestSource`, at `getGraphHealth()` time (`code-graph-provider.ts` spreads `this.graphHealth.input` and sets `provider: this`). The use case does not call `open` or `close`.

A `readText` result of `undefined` drops that file from the digest (`discoverResolutionInputs`) instead of throwing. The health `catch` therefore does not see a swallowed adapter read. The checked requirement nulls `fingerprintMismatch` when comparison does not run or throws. It does not require a read failure to null the comparison. Fingerprint mismatch does not write the stale latch; `knownStaleSinceLastIndex` still comes from existing latches. This was not scored as a contradiction.

## Spec: code-graph:composition

### Constraint checked

The composition factory still builds the store, adapter registry, and `IndexCodeGraph`, and it is the layer that may import infrastructure. Adding the manifest source must not export the concrete adapter or create a second per-use-case wiring path for `GetGraphHealth`.

### Status

conformant

### Evidence

`createCodeGraphProvider` still creates the selected store, registers the built-in language adapters plus `options.adapters`, then `const manifestSource = new NodeResolutionManifestSource()` and `new IndexCodeGraph(store, registry, manifestSource)`. When the argument is `SpecdConfig`, health input includes that same `manifestSource` and `createGetGraphHealth()`. The legacy options path still constructs the indexer with the same source. The concrete class is not re-exported from the factory module.

Python identity remains on the language adapter (`getPackageIdentity` → `findManifestField`). Composition does not add a parallel Python parser.

## Summary counts

| Count                    | Value                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs checked            | 6                                                                                                                                                    |
| Conformant specs         | 5 (`default:_global/architecture`, `default:_global/eslint`, `default:_global/conventions`, `code-graph:get-graph-health`, `code-graph:composition`) |
| Specs with discrepancies | 1 (`default:_global/testing`)                                                                                                                        |
| Discrepancies            | 2                                                                                                                                                    |

Discrepancy list:

1. Testing — application fingerprint and staleness tests still read a real temporary directory through `NodeResolutionManifestSource`.
2. Testing — three new behaviour titles omit `given …, when …, then …`.
