# Attempt 10 - scoped audit of task section 21 (post attempt-9 additions)

Read-only. Tests executed (all green): cli helpers + plugins/project-update/config-show suites (175), core kernel-builder + infrastructure (975), core config-writer spec, plugin-manager (294), claude (78), opencode (77), copilot (74), sdk (129); `tsc --noEmit` clean on core and plugin-manager.

Result: 0 majors, 5 minors. Code conforms to the merged spec deltas for every item.

## 1. core kernel-builder forwards additionalDestinations - CONFORMS

- `packages/core/src/composition/kernel-builder.ts:45,265-267,308-310`: state field, `cloneOptions` copy, `toKernelOptions` forwards (omits when empty). `KernelOptions.additionalDestinations` (`kernel.ts:292`) consumed at `kernel.ts:343`. Consistent with `core:kernel-builder` ("same resolver-backed assembly path as createKernel(config, options?)") and with `cli:host-context` (onLog destination passed through `openSpecdHost`).
- Test: `core/test/composition/kernel-builder.spec.ts:206-221` asserts the callback receives a `Logger.info` probe. Real-host CLI test `cli/test/helpers/cli-context-real-host.spec.ts` covers the end-to-end path.
- Minor m1 (spec gap): neither `core:kernel-builder` nor `sdk:host-context` (nor their verify.md) names `additionalDestinations` or has a scenario for "builder forwards logger destinations". Only the generic sentence covers it. Spec is under-specified, code is right.
- Minor m2 (test hygiene): `kernel-builder.spec.ts:206-221` builds a kernel and never disposes it; the callback destination stays installed in the global `Logger` for the rest of the file/worker. No failure observed.

## 2. cli minors - CONFORMS

- `cli/src/helpers/cli-cleanup.ts:14-17`: `describeFailure` flattens recursively via `flatMap`. Test `cli/test/helpers/cli-cleanup.spec.ts` ("flattens nested AggregateErrors ...") asserts 3-level order one/two/three. Consistent with `cli:host-context` "CLI cleanup registry" requirement (one warning per failure; no exit code change).
- Minor m3: an `AggregateError` with an empty `errors` array makes `describeFailure` return `[]`, so the failure is swallowed with no warning line (before this change it was also silent; now untested). Spec says a failing cleanup "SHALL be reported as a warning line". Edge case only, no test.
- `plugins show` capabilities: `show.ts:93-99` matches the plugins-show delta (install/uninstall hook or `agents` kind). `plugins-show-real-loader.spec.ts` covers hook-only, install-only, uninstall-only and none (text and JSON) with the real loader. Version printed is `plugin.version` (`show.ts:46,57`); loader enforces `plugin.version === manifest.version` (`plugin-manager/.../plugin-loader.ts:226`). Fixtures use the same `1.0.0` for manifest and plugin, so those tests cannot tell "loaded version" from "manifest version"; acceptable because the loader guarantees equality and `plugin-loader.spec.ts:596` covers the mismatch.
- `plugins list`: `list.ts:44,89-100,106-124` matches the delta (plugins:false, `Installed plugins:` header, `-` for unknown version, not_found/error empty `declared` and allowlist as `selected`, `no plugins declared`). `plugins.spec.ts:584,600,791` cover these.
- uninstall real-loader tests (`plugins-uninstall-real-loader.spec.ts`) use the real use case and loader; only `ConfigWriter.removePlugin` is mocked. Conforms. `plugins-install-real-loader.spec.ts`, `plugins-real-init-never-runs.spec.ts` present and green.
- `project-update-real-discovery.spec.ts`: discovery via `process.chdir` into an empty temp dir, restored in `finally`; plus the no-plugins JSON case. Conforms. (chdir is only safe because the cli package runs in forks; `config-show-real-loader.spec.ts` uses a `process.cwd` spy instead, so the two files are inconsistent but both work.)
- Minor m4 (test coverage gap): task 21.2 says "dispose-twice releases once through the CLI, not only the sdk". `cli-context.spec.ts:205-243` proves it only with a hand-written memoising mock (and shows the CLI itself does not dedupe: 3 calls reach the host). `cli-context-real-host.spec.ts` has a single test (log delivery) and does not dispose a real kernel twice. The spec ("dispose SHALL be the host's idempotent disposal") is satisfied by delegation; the real-kernel idempotency is covered only in sdk/core tests.
- `config-show-real-loader.spec.ts` leaks its temp dirs (`mkdtemp` without cleanup in `writeBrokenPluginProject` and the two "no config" cases). Cosmetic.

## 3. core public.ts exports / sdk re-exports / config-writer - CONFORMS

- `core/src/public.ts:13-17` exports `AddPluginOptions`, `ConfigDeclaredPlugin`, `ConfigWriter` as types; `sdk/src/core-reexports.ts:5` re-exports them; `sdk/test/barrel.spec.ts:64-68` checks identity with `expectTypeOf` (tests are in the tsconfig `include`, so tsc enforces them).
- `core/test/infrastructure/fs/config-writer.spec.ts:564-590`: `configVersion: 999` without `plugins`: addPlugin rejects with `UnsupportedConfigVersionError` (also `ConfigValidationError`) and the file is byte-identical; removePlugin resolves untouched; listPlugins returns `[]`. Matches the edited `core:config-writer-port` AddPlugin text.
- Minor m5 (spec gap): `sdk:composition` "Public barrel exports" bullet lists `isPluginName`, `PLUGIN_NAME_REGEX`, `createConfigWriter` but not the three new types (`ConfigWriter`, `AddPluginOptions`, `ConfigDeclaredPlugin`), nor `LegacyConfigFormatError` / `UnsupportedConfigVersionError` that `barrel.spec.ts:70-71` asserts. Code exports them via the generic "errors / bootstrap" bullet, so no behavioural conflict, but the list is not exhaustive. Gap: no test for a newer `configVersion` WITH a `plugins` key (spec is silent on it).

## 4. plugin-manager / copilot / claude / opencode tests - CONFORMS

- `plugin-repository-port.spec.ts:31-65` adds a runtime conformance check against the real `createConfigWriter()` plus two negative cases (missing member, non-function). Note: `PORT_METHODS` is hand-mirrored in the test and the negative cases exercise the helper with fakes, so a rename in the port would still need the compile-time check (`ConfigWriterConforms`, present and type-checked). Acceptable; no finding.
- `plugin-loader.spec.ts`: multi-scenario blocks are split (about 40 single-scenario `it`s, named given/when/then). Conforms.
- copilot `uninstall-skills.ts`: conditional with identical branches removed; `filteredAgentFile` is now a trivial one-line arrow (cosmetic). Behaviour matches the copilot/opencode filtered-uninstall wording (agents file removed from runtime dir, or shared dir when `agents` capability is absent).
- claude `frontmatter-values.spec.ts` + `real-pipeline.spec.ts`: runtime assertions on supported keys and absence of `mode|permission|temperature|tools|allowed-tools`; real pipeline asserts hyphenated rendered keys, `disable-model-invocation: true` on fast-track and journal-resumability text from the real template (matches the claude Frontmatter injection delta). `SUPPORTED_KEYS` in the test is a superset of the spec list (also `effort`, `context`, `agent`, `hooks`, `paths`, `shell`); lenient but not wrong.
- opencode `real-pipeline.spec.ts`: legacy `<!-- <specd-plugin:opencode> -->` marker is gone after a real install and user content kept; matches opencode delta ("injecting the shared block purges it"). Conforms.

## 5. Spec deltas edited this round - CONSISTENT with code and dependencies

- `sdk:host-context` createSdkContext/Host disposal: code `sdk/src/composition/host-context.ts:94-124,188-229` matches (plugins:false skips registration, rollback errors attached as `rollbackErrors`, frozen/primitive build error propagates unchanged with `Logger.warn`; limitation documented in a code comment and spec "when no logger implementation has been configured yet they are not emitted"). Dependencies list (`core:kernel-builder`, `plugin-manager:plugin-errors`) valid.
- `sdk:composition`: package.json deps = core, code-graph, plugin-manager only (`packages/sdk/package.json:15-19`), matches the Package identity requirement and the `cli` import policy.
- `cli:plugins-list` / `cli:plugins-show`: version = loaded plugin version (equal to manifest by loader rule), both obtain the context with `plugins: false` (`list.ts:44`, `show.ts:30`; install/uninstall/update too). Consistent with `plugin-manager:specd-plugin-type` version equality.
- `core:config-writer-port`: Delivery access via `createConfigWriter` re-exported by `@specd/sdk` is what the CLI does; unsupported-version wording matches tests (see item 3).

## Summary counts

majors: 0
minors: 5 (m1 kernel-builder spec/verify silent on additionalDestinations; m2 core test leaves global logger destination; m3 empty AggregateError swallowed silently; m4 no real-kernel dispose-twice test through the CLI; m5 sdk:composition barrel list omits new types/errors)
