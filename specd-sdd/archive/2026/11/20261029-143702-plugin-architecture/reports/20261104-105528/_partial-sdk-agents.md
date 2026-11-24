# Compliance audit (partial): batch sdk-agents — change `plugin-architecture`

Read-only audit. Specs read via `changes spec-preview`; code/tests read directly. Totals: critical 0, major 2, minor 9.

---

## sdk:composition — requirements: 6 of 7 OK, 1 PARTIAL

| Requirement                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identity and dependencies          | OK. `packages/sdk/package.json:15-19` lists only core, code-graph, plugin-manager. plugin-manager depends only on core (`packages/plugin-manager/package.json:32-35`). Tested in `sdk/test/composition/package-boundary.spec.ts`.                                                                                                                                                                                                                                                                                                   |
| Layer structure                            | OK. `src/` has composition, orchestration, presentation, shared, domain; no `infrastructure/`. `src/domain/errors` holds only `InvalidProviderLifecycleError`. `exports["."]` points to `dist/index.js` and `dist/index.d.ts` (`package.json:20-23`). `./ports` and `./extensions` subpaths exist.                                                                                                                                                                                                                                  |
| Public barrel exports                      | OK. Checked in `src/index.ts` and `src/core-reexports.ts`: no `export * from '@specd/core'` (the `export *` is from the local `core-reexports.js`). The plugin error classes, `ContributionKindHandler`, `ContributionActivationContext`, `isPluginName`, `PLUGIN_NAME_REGEX` (`core-reexports.ts:526-527`) and `createConfigWriter` (`core-reexports.ts:4`) are exported. The Materialize/Get/Regenerate/InitializePersisted use cases and factories are present. No Save/Update/Invalidate/Persist SpecMetadata symbols in `src`. |
| Public barrel exports for host adapters    | OK. Verified against `src/index.ts:60-140`: `runIsolatedGraphIndex`, the worker error classes, `createGetGraphHealth`, fingerprint helpers, `createBootstrapGraphConfig`, `GraphSpecNotFoundError` alias, `DEFAULT_HOTSPOT_KINDS` and `CODE_GRAPH_VERSION` are all there. No lock helpers are exported.                                                                                                                                                                                                                             |
| Import policy for integrators              | PARTIAL. See discrepancy D1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Version constant                           | OK (`index.ts:end`, `SDK_VERSION` read from package.json).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Implementation review public orchestration | OK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Discrepancies

**D1 (major) — CLI depends on more specd packages than the verify scenario allows.**

- Spec side: scenario "CLI has no direct core dependency" says "only `@specd/sdk` is listed among specd platform packages". The requirement itself says hosts MUST depend on `@specd/sdk` only, not on core and code-graph as parallel dependencies. The error-class requirement says hosts catch plugin errors "without depending on plugin-manager directly".
- Code side: `packages/cli/package.json:30-38` lists `@specd/sdk` plus `@specd/guide`, `@specd/plugin-agent-claude`, `-codex`, `-copilot`, `-opencode`, `-standard`, `@specd/plugin-manager` and `@specd/schema-std`.
- Code imports `InstallPlugin`, `UninstallPlugin`, `UpdatePlugin`, `ListPlugins`, `createPluginLoader` directly from `@specd/plugin-manager` (`cli/src/commands/plugins/{install,uninstall,list,show,update}.ts`). The SDK does not re-export these.
- There is no direct core or code-graph dependency in the CLI, so the requirement text is met. The scenario text is stricter than the code. The plugin-manager use cases and loader are not on the SDK surface.
- Resolution: either loosen the scenario to "no direct core or code-graph dependency", or add SDK re-exports. The requirement and the SDK public-barrel list do not mention the plugin-manager use cases.

**D2 (minor) — scenario "Plugin may depend on core directly" is weakly tested.** It is only half covered by `package-boundary.spec.ts` (it checks that plugin-manager does not depend on the SDK).

### Test coverage gaps

- No test for "CLI has no direct core dependency" (it would fail as written, see D1).
- No test asserting that `src/` has no `infrastructure/` directory, or that `domain/` holds no entities or ports.
- No test that `exports` contains no `shared` subpath. `barrel.spec.ts:180` covers part of it.
- No test for "Dependency graph stays acyclic" beyond plugin-manager's own package.json.

---

## sdk:host-context — requirements: 4 of 4 OK

| Requirement              | Status                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SdkHostContext shape     | OK. `host-context.ts:31-41`: `kernel`, `createGraphProvider`, `dispose`, plus `AsyncDisposable`. No stored config.                                                                                                                                                                                                                             |
| createSdkContext         | OK. `host-context.ts:96-123`. The builder is created from `config` and `options.kernel`. `registerPlugins` runs unless `plugins === false`. On build failure the registration is disposed. Dispose failures are attached as `rollbackErrors` and the build error propagates (`:134-165`). `createGraphProvider` closes over the same `config`. |
| openSpecdHost            | OK. `:136-172`. Mixed `configPath` and `startDir` are rejected. The bootstrap fallback is gated on `allowBootstrapFallback`, no `configPath`, and `ConfigNotFoundError`. It resolves the VCS root through `createVcsAdapter`. The result spreads the context.                                                                                  |
| Host disposal            | OK. `dispose` delegates to `kernel.dispose()`. `Symbol.asyncDispose` is the same function. Graph providers are not closed. No API wraps a foreign kernel.                                                                                                                                                                                      |
| Config mutation boundary | OK.                                                                                                                                                                                                                                                                                                                                            |

### Discrepancies

- **D3 (minor)** — `attachRollbackErrors` (`host-context.ts:165` area) silently drops rollback errors when the build error is a primitive or `null`. This is a corner case not covered by the spec ("attached to it as `rollbackErrors`"). The rollback errors are lost in that case.
- **D4 (minor)** — `openSpecdHost` always calls `createDefaultConfigLoader({ startDir })` in discovery mode, and passes `process.cwd()` when `startDir` is absent. This matches the spec. When the fallback fires, `createSdkContext` is run with `plugins` according to `input.options`. The bootstrap config has no plugins, so this is harmless.

### Test coverage

- All listed scenarios have tests in `host-context.spec.ts` and `host-context-e2e.spec.ts`: plugins before build, plugins false, empty plugin list, broken plugin, build failure, rollbackErrors, e2e init and destroy order, extra handlers, fallback, explicit-config no-fallback, await using, no foreign-kernel wrap.
- Gap: no test for a non-object build error with a dispose failure (see D3).

---

## skills:shared-folder-owners — requirements: 5 of 5 OK

Implementation: `packages/skills/src/application/shared-folder-owners.ts`. Exports are in `skills/src/index.ts:23-26`.

- **Owners marker file**: OK. `serializeMarker` writes sorted, deduplicated, pretty JSON. Invalid, unreadable or missing files are treated as absent. Reads do not repair.
- **Registering an owner**: OK. Creates the folder with `mkdir -p`. Re-registering is a byte-identical no-op. An invalid marker is replaced by `[agentId]`.
- **Releasing an owner**: OK. Returns `{remaining, hadMarker}`. The marker is deleted when none remain. Non-owner release returns `hadMarker: true` with the owners unchanged. No marker means nothing is created or modified.
- **Removing the folder only when empty**: OK. Uses `rmdir`, swallows `ENOTEMPTY` and `ENOENT`, rethrows the rest.
- **Uninstall protocol for agent plugins**: implemented in each plugin (see below). OK in all five.

### Discrepancies

- **D5 (minor)** — Constraint "helpers use only `node:fs/promises`": the file also imports `node:path`. This is harmless, but the constraint wording is slightly off.
- **D6 (minor)** — `readMarkerFile` treats a missing file as `undefined`. In `removeSharedOwner` it is equivalent to "no marker". Behavior is correct.

### Tests

Tests are in `skills/test/application/shared-folder-owners.spec.ts` (12 tests) plus `shared-folder-owners-eacces.spec.ts` (EACCES rethrow). All spec scenarios for the helpers are covered. Gap: the "Uninstall protocol" scenarios exist per plugin only (see the table below).

---

## Agent plugins (claude, copilot, codex, opencode, standard)

All five share the same structure, so the common findings come first.

Common checks, all OK in all five:

- `create()` is an async factory that reads the manifest from its own directory, then from the parent. No `type` property. The class takes `name` and `version` in its constructor.
- Manifest: `schemaVersion: 2`, `contributes.agents.<id>`, no `pluginType`. Verified in the five `specd-plugin.json` files.
- `install` and `uninstall` take `AgentInstallContext` and forward `context.config` and `context.options`.
- Bundles go through `ResolveBundle`. Capability arrays are literals. There is no `buildCapabilities` helper and no direct `getBundle` call.
- `addSharedOwner` is called after writes when `wroteShared`, for filtered and unfiltered installs.
- A filtered uninstall returns before touching the prompt block, the marker or shared files.
- The full uninstall follows the owners protocol: `removeSharedOwner`, then delete `shared.md` plus `<agent>.agent.md` plus the marker only if `hadMarker && remaining.length === 0`, then `removeSharedFolderIfEmpty`.
- Prompt injection and removal use `injectSpecdBlock` and `removeSpecdBlock(path, id)`.

### plugin-agent-claude:plugin-agent — all requirements OK

- Install dir `.claude/skills`, agents `.claude/agents/<n>.md`. The `agents` capability falls back to the shared dir as `<n>.agent.md` (`install-skills.ts:58-60,142`). The default capabilities are `['mcp','agents','frontmatter']`.
- Agent frontmatter: `tools` is a comma-separated string. `model` comes from `item.metadata.model` only when set.
- Frontmatter type covers all 14 fields (`domain/types/frontmatter.ts`). `specd-fasttrack` has `disable_model_invocation: true` and a manual-only description (`domain/frontmatter/index.ts:19-24`).
- **Minor (D7)**: `metadata.allowed_tools.split(', ').join(', ')` (`install-skills.ts:86`) is a no-op that normalizes nothing. The spec says "map into a single comma-separated string". It works, but the code is dead.
- Tests: `test/install-skills.spec.ts` covers shared routing, agent frontmatter, model, owners (filtered, other owner, last owner, foreign file, legacy, skills filter), no-agents-capability fallback, and the CLAUDE.md block. Gap: no explicit test of a filtered `agents` uninstall that keeps the marker. The "tools comma-separated" assertion is indirect.

### plugin-agent-copilot:plugin-agent — all requirements OK, one spec/code mismatch

- Dirs `.github/skills`, `.github/agents/<n>.agent.md`. `tools` is emitted as a list (`install-skills.ts:82-93`). Default capabilities `['frontmatter','agents']`. The frontmatter field set matches. `specd-fasttrack` has `'disable-model-invocation': true`. Prompt goes to `.github/copilot-instructions.md`.
- **D8 (minor, spec text vs code)**: the spec's dependency line says the copilot plugin "reads its skills through the templates source rather than the skill repository used by the other agent plugins" (`skills:skill-templates-source`). The code uses `createSkillRepository()` like the others (`install-skills.ts:32`, `uninstall-skills.ts:56`). Either the spec dependency note is stale or the code should use the templates source. The codex spec also lists `skill-templates-source` while its code also uses the repository.
- **D9 (minor)**: the agent `allowed-tools` split is on `,` only, so any tool string containing a comma inside a pattern would split wrongly. Unlikely in practice.
- Tests (7 install tests plus 3 class tests): no test for last-owner removal, foreign file, legacy marker-less folder, a filtered uninstall leaving the marker, or fast-track install/frontmatter. Coverage gap: moderate.

### plugin-agent-codex:plugin-agent — all requirements OK

- Dirs `.codex/skills`, `.codex/agents/<n>.toml`. TOML has `name`, `description` and `developer_instructions = """..."""` with `escapeTomlBasicMultiline`. The `.agent.md` fallback without the `agents` capability is in `install-skills.ts:134-136`. The frontmatter is only `name` and `description`. The fast-track description is manual-only.
- **D10 (minor)**: `name`/`description` TOML values are quoted with `JSON.stringify`. That is valid TOML basic-string escaping for ordinary text, but not guaranteed for all JSON escapes (for example ` ` is not a TOML escape). Edge case.
- Tests: the escaping test is good. Gaps: no last-owner, foreign-file, legacy or filtered-uninstall marker tests, and no fast-track test.

### plugin-agent-opencode:plugin-agent — all requirements OK

- Dirs `.opencode/skills`, `.opencode/agents/<n>.md`. `mode: "subagent"` is set. `toOpenCodePermission` (`install-skills.ts:187-222`) lowercases tool names, nests patterns, maps a bare tool plus patterns to `"*": allow`, and uses a Map so there are no duplicate keys. `install()` calls `removeSpecdBlock('opencode')` before `injectSpecdBlock`, as the spec requires (`:166-168`). The frontmatter type matches (`allowed_tools` only for agents).
- Project-init wizard includes opencode (`cli/src/commands/project/init.ts:18`). The `@specd/specd` meta package lists it (`specd/package.json`).
- Tests: a permission test exists (`install-skills.spec.ts` near line 326). Gaps: no last-owner, foreign-file or filtered-marker tests.

### plugin-agent-standard:plugin-agent — all requirements OK

- Dirs `.agents/skills`; agents always go to the shared dir as `<n>.agent.md`. Capabilities are `['frontmatter']`. `allowed-tools` is a space-separated string for every skill, with no colon style. `specd-compliance` includes `Bash(node *)` and `Bash(pnpm *)`. The fast-track entry has `allowed-tools` and a manual-only description. A filtered agent uninstall removes only `<shared>/<agent>.agent.md` (`uninstall-skills.ts:42-46`). Init-wizard and meta-package inclusion are OK.
- **D11 (minor)**: `agentFrontmatter` entries have no `allowed-tools`, so the `metadata['allowed-tools']` branch in install (`:80-82`) is dead code. It would also emit an array where the type says a space-separated string.
- Tests: standard has the most coverage (selected agent uninstall, legacy marker-less folder, two tagged blocks). Gap: no last-owner or foreign-file test.

### Cross-spec check

- The plugin specs depend on `plugin-manager:agent-plugin-type`, `skills:shared-folder-owners`, `skills:resolve-bundle` and `skills:agent-instruction-template`. No contradictions were found with these.
- Manifest versions differ between plugins (opencode 0.0.3, standard 0.1.0, others 0.2.0). The spec does not constrain this.

### Findings: **D12 (major)** — owner registration is skipped when install throws midway.

- Spec: "After writing any file into the shared folder, `install()` MUST call `addSharedOwner`".
- Code (all five plugins): `addSharedOwner` runs once at the end of `install` (for example `claude/install-skills.ts:167-169`, `standard/install-skills.ts:163-165`). If a later skill or agent fails after earlier shared files were written, the marker is never created. The shared files then look like a "legacy install" and are never cleaned up on uninstall.
- This is a robustness gap rather than a literal violation. The "after writing any file" wording is arguably satisfied only on the success path.
- Severity: major, shared by all five plugins (one finding, not five).

---

## Summary counts

- Critical: 0
- Major: 2 (D1 CLI dependency scenario vs code; D12 deferred `addSharedOwner` on partial failure)
- Minor: 9 (D2, D3, D5, D7, D8, D9, D10, D11, plus the plugin test-coverage gaps for the owners last-owner/foreign/legacy scenarios in copilot, codex and opencode)

Per-spec status: sdk:composition PARTIAL (D1); sdk:host-context OK; skills:shared-folder-owners OK; plugin-agent-claude OK; plugin-agent-copilot OK; plugin-agent-codex OK; plugin-agent-opencode OK; plugin-agent-standard OK.
