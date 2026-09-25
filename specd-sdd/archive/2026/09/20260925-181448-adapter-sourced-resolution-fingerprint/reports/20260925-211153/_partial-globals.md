## Global conformance

Checked the working tree for change `adapter-sourced-resolution-fingerprint` against five global specs. Specs were read with `specs show --format text`. Code evidence is the uncommitted diff under `packages/code-graph` and `packages/cli/test/commands/graph-stats.spec.ts`. Pre-existing behaviour is noted only where this diff keeps or extends it. No finding is inferred from absence of a test or from a requirement this diff does not touch.

### Per global spec: conformant / finding

| Spec                                         | Status     |
| -------------------------------------------- | ---------- |
| `default:_global/architecture`               | finding    |
| `default:_global/conventions`                | conformant |
| `default:_global/testing`                    | finding    |
| `default:_global/eslint`                     | conformant |
| `default:_global/error-handling-conventions` | conformant |

### Discrepancies with evidence

#### `default:_global/architecture` — finding

**Domain layer is pure: conformant.** No file under `packages/code-graph/src/domain` imports `node:fs` or `fs`, and none calls `readFileSync` or `existsSync`. The new `LanguageAdapter.resolutionManifests()` method is a basename declaration. Its JSDoc states that it does not perform I/O. The four infrastructure implementations return constant arrays (`package.json`, `pyproject.toml`, `go.mod`, `composer.json`) and do not read those files inside `resolutionManifests()`.

**Application layer uses ports only: discrepancy.** `default:_global/architecture` requires every package's `application/` layer to interact with the outside world exclusively through port interfaces in `application/ports/`, and not to import infrastructure adapters directly.

`packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts` imports `existsSync`, `lstatSync`, and `readFileSync` from `node:fs`. `hashManifestText` reads manifest bytes with `readFileSync`. `discoverResolutionInputs` checks directories with `existsSync` and files with `lstatSync`. Those calls sit in an application use-case helper, not behind a port and not in `infrastructure/`.

This is not a domain-layer I/O breach. Direct `node:fs` in that application helper is not allowed by the ports-only requirement.

Scope: the same file already imported `node:fs` before this change (`existsSync`, `readFileSync`, `readdirSync`). This diff keeps that boundary and extends it: content hashing moved into `hashManifestText`, directory listing was replaced by `lstatSync`, and the walk now climbs from `codeRoot` toward `repoRoot`. Callers (`index-code-graph.ts`, `get-graph-health.ts`, `create-code-graph-provider.ts`) pass `LanguageAdapter[]` into the helper; they do not move the reads onto a port.

**Other architecture requirements checked, no discrepancy in this diff:**

- Application files in the diff do not import `infrastructure/` or `composition/`. The import constraint is met. The ports-only I/O requirement is the one that fails.
- `resolutionManifests()` is a method on the existing `LanguageAdapter` interface. That interface is not a port with shared constructor arguments, so the abstract-class port rule does not apply to this addition.
- No new YAML parse path. Manifests are hashed as text. The infrastructure YAML-validation requirement is not exercised.
- No new package dependency, public concrete-adapter export, or second `createX(config)` wiring path. `create-code-graph-provider.ts` only passes `registry.getAdapters()` into the existing health input.
- CLI test changes only thread `[]` and `null` into fingerprint calls. No business logic was added under `packages/cli`.

#### `default:_global/conventions` — conformant

Checked the changed source against strict-mode artifacts already present (no new `tsconfig` override), ESM imports, named exports, kebab-case paths, `any`, explicit return types, error types, and immutability of the new fingerprint types.

- New and updated exports use named exports. No `export default` in the changed source.
- New source symbols have explicit return types (`resolutionManifests(): readonly string[]`, `hashManifestText(...): string | undefined`, and the existing fingerprint functions keep `: string` / `: boolean`).
- No new `: any` or `as any`. The fingerprint unit file replaces `specRepo: {} as any` with `as never`.
- New interfaces (`GraphFingerprintInput` fields, `ResolutionInputFingerprint`) use `readonly`.
- No new source file. Existing paths stay `kebab-case.ts`. Tests stay under `test/` with the `.spec.ts` suffix.
- Changed production code does not throw a new generic `Error` for an expected failure. Unreadable manifest paths are omitted (`hashManifestText` returns `undefined`; `lstatSync` failures are skipped). That is silent omission, not a new thrown error type. See error-handling below.

#### `default:_global/testing` — finding

**1. Application-layer tests perform real filesystem I/O.**

`default:_global/testing` says domain and application layers are covered by unit tests with mocked ports, and that unit tests must not touch the filesystem. Filesystem access belongs in infrastructure integration tests.

These tests live under `packages/code-graph/test/application/use-cases/` and call `mkdtempSync`, `mkdirSync`, `writeFileSync`, and (via the helper under test) `readFileSync`:

- `compute-graph-fingerprint.spec.ts`: the rewritten package.json case and the new cases for CRLF, undeclared `tsconfig.json`, parent `composer.json`, repo-root bound, null `repoRoot`, and a directory named `package.json`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

The fingerprint file already used `mkdtempSync` for manifest invalidation before this change. This diff keeps that style and adds more filesystem cases. The behaviour under test is filesystem discovery inside an application helper, so the tests match the implementation and contradict the unit-test rule.

**Temp-directory fixture rules: met, not a separate finding.**

New filesystem cases use `mkdtempSync(join(tmpdir(), ...))` from `node:os`. They do not hardcode `/tmp` or `file:///tmp/`, and they do not use `chmod 0o000`. Each case removes its directory with `rmSync` in a `finally` block. The verify scenario names `afterEach` as the cleanup hook; these cases clean up inside the test instead. The directories are still removed after each test. That is not recorded as a discrepancy.

`/tmp/...` strings in `packages/cli/test/commands/graph-stats.spec.ts` are outside this diff. The diff only adds `[]` and `null` arguments.

**2. Three new behaviour titles do not use `given …, when …, then …`.**

`default:_global/testing` requires behaviour-test descriptions in that form.

Titles that do follow it:

- `compute-graph-fingerprint.spec.ts`: seven new or rewritten cases, from `given adapter declares package.json, when that file changes, then fingerprint changes` through `given a directory named like a manifest, when discovered, then it is omitted`.
- Adapter specs: `given go adapter, when asked for manifests, then returns go.mod only`; the python, php, and typescript equivalents.

Titles that do not:

- `compute-graph-fingerprint.spec.ts`: `computeGraphFingerprint includes adapters and repoRoot`.
- `staleness-detection.verify.spec.ts`: `Scenario: CRLF resolution manifest stays derivation-fresh` and `Scenario: Edited resolution manifest is a derivation mismatch`.

Those two staleness titles match the existing `Scenario:` style of that file. They still do not match the global behaviour-test pattern.

**Other testing requirements checked, no discrepancy in this diff:**

- Runner imports are `vitest`. No Jest. No `toMatchSnapshot` or `toMatchInlineSnapshot`.
- `stubAdapter` builds a `LanguageAdapter` object with the required methods. It is not `as unknown as` a port. `LanguageAdapter` is a domain interface, not a port, so the full-port-mock rule was not applied as a failure. `analyzeFile` throws `new Error('unused')`; `resolveImports` and `buildRelations` return empty values.
- New `resolutionManifests` assertions on the four language-adapter specs do not create temp directories. Existing `getPackageIdentity` blocks already use `tmpdir()` and `afterEach` cleanup; this diff does not change that setup.

#### `default:_global/eslint` — conformant

Changed source matches the lint-facing rules that eslint is specified to enforce:

- No new explicit `any` or `as any` in source.
- No new default export.
- New exported methods and functions have return types. New internal helpers (`normalizeManifestNewlines`, `hashManifestText`, `collectResolutionBasenames`, `discoverResolutionInputs`, `collectWalkDirectories`) also annotate returns and have JSDoc.
- New JSDoc blocks include a description, `@param` for each parameter, and `@returns`. `resolutionManifests()` has no parameters. `hashManifestText` catches read failures and returns `undefined`, so it does not declare `@throws`.
- No new `src/` filename. Existing names are kebab-case.
- No new layer-import violation: domain does not import application, infrastructure, or composition; the application helper does not import infrastructure or composition. `node:fs` inside application is the architecture finding above, not an `no-restricted-imports` layer import of `infrastructure/`.
- Test files are exempt from JSDoc. The new tests were not judged against the JSDoc rule.

#### `default:_global/error-handling-conventions` — conformant

This diff adds no error class, no `code`, and no user-facing message.

- `hashManifestText` and the `lstatSync` loop swallow read failures and omit the path. Callers do not receive a generic `Error` or a `SpecdError` for an unreadable manifest.
- `GetGraphHealth` still wraps fingerprint detection in `try/catch` and sets `fingerprintMismatch = null`. That catch is pre-existing; the diff only passes `input.adapters ?? []` and `vcsRoot` into `detectFingerprintMismatch`.
- `stubAdapter` throws `new Error('unused')` from a test double. That is test code. The testing spec itself uses `new Error('not implemented')` for unused mock methods.
- No new `UPPER_SNAKE_CASE` code, metadata field, or error-class JSDoc was required because no error type was added.

### Summary counts

| Count                | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| Global specs checked | 5                                                         |
| Conformant           | 3 (`conventions`, `eslint`, `error-handling-conventions`) |
| With findings        | 2 (`architecture`, `testing`)                             |
| Discrepancies        | 3                                                         |

Discrepancy list:

1. Architecture — application fingerprint helper reads the filesystem with `node:fs` instead of a port. Domain layer does not.
2. Testing — application-layer fingerprint and staleness tests use a real temporary filesystem.
3. Testing — three new behaviour titles omit `given …, when …, then …`.
