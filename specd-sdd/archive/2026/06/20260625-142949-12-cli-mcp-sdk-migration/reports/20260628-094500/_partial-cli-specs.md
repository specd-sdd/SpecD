# Spec Compliance Audit — CLI Specs (Change `12-cli-mcp-sdk-migration`)

**Audit scope:** `cli:project-status`, `cli:graph-index`, `cli:graph-stats`, `cli:host-context`, `cli:graph-cli-context`, `cli:entrypoint`

**Implementation packages:** `packages/cli/`, `packages/sdk/`

**Audit date:** 2026-06-29 (read-only)

---

## cli:project-status

### Requirements Summary

| #   | Requirement                                                                                       | Priority |
| --- | ------------------------------------------------------------------------------------------------- | -------- |
| R1  | `project status` command exists under `project` subcommand                                        | MUST     |
| R2  | Rich workspace info via `ListWorkspaces`                                                          | MUST     |
| R3  | Spec counts via `getProjectSummary` (not `SpecRepository.count` / `ListWorkspaces` for counting)  | MUST     |
| R4  | Change counts via `getProjectSummary` (not direct list use cases)                                 | MUST     |
| R5  | Approval gate flags in output                                                                     | MUST     |
| R6  | Graph freshness always via `buildProjectStatusSnapshot({ includeGraph: true })` from `@specd/sdk` | MUST     |
| R7  | `--graph` adds hotspots + extended stats from snapshot                                            | MUST     |
| R8  | Config flags (`llmOptimizedContext`, approvals) always included                                   | MUST     |
| R9  | `--context` assembles context via `GetProjectContext.execute` with runtime overrides only         | MUST     |
| R10 | `stale-optimization` warning to stderr when optimized context missing/stale                       | MUST     |
| R11 | Default text output; `--format json\|toon` supported                                              | MUST     |
| R12 | Host bootstrap via `openSpecdHost` (directly or via `resolveCliContext`)                          | MUST     |

### Implementation Status

| Req | Status                    | Evidence                                                                                                                                                                          |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented            | `packages/cli/src/commands/project/status.ts` — `registerProjectStatus`                                                                                                           |
| R2  | ✅ Implemented            | `kernel.project.listWorkspaces.execute()` (L47); workspace fields mapped in output (L124–129, L179–183)                                                                           |
| R3  | ✅ Implemented (indirect) | Counts from `snapshot.summary` via `buildProjectStatusSnapshot` → SDK calls `getProjectSummary.execute()` (`packages/sdk/src/orchestration/build-project-status-snapshot.ts` L47) |
| R4  | ✅ Implemented (indirect) | Same SDK path; active/draft/discarded/archived rendered (L135–139, L187)                                                                                                          |
| R5  | ✅ Implemented            | `snapshot.approvals` (L66–67, L210–211)                                                                                                                                           |
| R6  | ✅ Implemented            | `buildProjectStatusSnapshot(host, { includeGraph: true, ... })` (L48–51); maps `graphHealth.stale` / `lastIndexedAt` (L62–64)                                                     |
| R7  | ✅ Implemented            | `includeHotspots: opts.graph ?? false` (L50); extended fields when `opts.graph` (L145–164, L192–208)                                                                              |
| R8  | ✅ Implemented            | `llmOptimizedContext` and approvals in all output modes (L66–67, L166–167, L210–212)                                                                                              |
| R9  | ✅ Implemented            | `getProjectContext.execute({})` primary (L79); `execute({ llmOptimizedContext: false })` for raw spec list when fresh (L103–105); no inline `CompileContextConfig`                |
| R10 | ✅ Implemented            | Forwards `ctxResult.warnings` to stderr as `warning: …` (L81–83); relies on core warning message content                                                                          |
| R11 | ✅ Implemented            | `parseFormat` + text/json/toon branches (L37, L119–227)                                                                                                                           |
| R12 | ✅ Implemented            | `openSpecdHost` with `buildCliKernelOptions()` (L38–41)                                                                                                                           |

### Discrepancies

1. **Indirect `getProjectSummary` call (low severity — likely spec drift)**
   - **Spec says:** Handler calls `kernel.project.getProjectSummary.execute()` directly for counts.
   - **Code does:** Calls `buildProjectStatusSnapshot`, which internally calls `getProjectSummary`.
   - **Assessment:** Behaviourally correct for the migration; spec wording may need updating to reflect SDK orchestration as the CLI boundary.

2. **Graph-unavailable text label (low severity — impl edge case)**
   - **Spec says:** When `graphHealth: null`, freshness fields MUST be `null`.
   - **Code does:** JSON/toon emit `null` correctly; text mode prints `(graphStale ? 'stale' : 'fresh')` which shows `fresh` when `graphHealth` is `null` (L188).
   - **Assessment:** Possible impl bug for text mode when graph health is unavailable.

3. **Missing JSON/TOON help schema (cross-spec — see `cli:entrypoint`)**
   - `project status` supports `--format json|toon` but has no `addHelpText('after', …)` schema block.

### Test Coverage

**File:** `packages/cli/test/commands/project-status.spec.ts`

| Scenario                                                                | Covered |
| ----------------------------------------------------------------------- | ------- |
| Command registration                                                    | ✅      |
| Counts via snapshot / summary output                                    | ✅      |
| Archived count in JSON/TOON                                             | ✅      |
| `--context` optimized vs raw, warnings, `getProjectContext` call shapes | ✅      |
| Full context in text mode                                               | ✅      |

### Missing Tests

- `--graph` flag: hotspots, file/symbol counts in output
- Default graph freshness fields (without `--graph`)
- JSON/TOON full output shape (workspaces, graph, approvals, `llmOptimizedContext`)
- `openSpecdHost` called with `configPath` when `--config` provided
- Text output when `graphHealth` is `null`
- Approval gate values in text output

### Summary (cli:project-status)

| Metric               | Count                                              |
| -------------------- | -------------------------------------------------- |
| Requirements         | 12                                                 |
| Implemented          | 12                                                 |
| Discrepancies        | 3 (0 critical, 1 edge-case impl, 2 low/spec-drift) |
| Scenarios with tests | ~10 / ~18                                          |
| Missing test areas   | 6                                                  |

---

## cli:graph-index

### Requirements Summary

| #   | Requirement                                                                          | Priority |
| --- | ------------------------------------------------------------------------------------ | -------- |
| R1  | Command signature with `--force`, `--exclude-path`, `--config`, `--path`, `--format` | MUST     |
| R2  | Index via `runIndexProjectGraph` in `@specd/sdk`; host via `openSpecdHost`           | MUST     |
| R3  | CLI retains lock acquisition, worker spawn, progress callback, `--force` forwarding  | MUST     |
| R4  | Text summary block format; JSON/toon full `IndexResult`                              | MUST     |
| R5  | Infrastructure/lock errors → exit 3; per-file errors → exit 0                        | MUST     |
| R6  | `docs/cli/cli-reference.md` `## graph` section documents all subcommands             | SHALL    |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                                      |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/commands/graph/index-graph.ts` L17–31                                                                                                       |
| R2  | ✅ Implemented | Worker path: `resolveSdkHostContext` + `runIndexProjectGraph` (L109–119); SDK orchestration in `packages/sdk/src/orchestration/run-index-project-graph.ts`    |
| R3  | ✅ Implemented | Lock: `acquireGraphIndexLock` (L68); worker spawn + env vars (L79–107); `onProgress` in text mode (L113–117); `SPECD_GRAPH_INDEX_NO_WORKER` bypass (L47, L79) |
| R4  | ✅ Implemented | `formatTextIndexResult` (L143–171); JSON/toon via `output(result, fmt)` (L125)                                                                                |
| R5  | ⚠️ Partial     | Lock failure → exit 3 (L70–74) ✅; mutual-exclusive flags → exit 1 ✅; **indexing catch → exit 1** (L129–132) ❌ vs spec exit 3 for infrastructure errors     |
| R6  | ✅ Implemented | `docs/cli/cli-reference.md` L1047+ covers `graph index`, `search`, `hotspots`, `stats`, `impact` with flags and examples                                      |

### Discrepancies

1. **Infrastructure indexing failure exit code (impl bug — medium)**
   - **Spec says:** I/O / indexing infrastructure failure → exit code 3.
   - **Code does:** Outer `catch` calls `cliError(..., 1)` (L129–132).
   - **Evidence:** `packages/cli/src/commands/graph/index-graph.ts` L129–132.

2. **Worker non-zero exit propagation (low — impl ambiguity)**
   - **Spec says:** Parent propagates worker exit code.
   - **Code does:** `process.exit(code ?? 1)` (L104) — worker infrastructure failures may surface as 1, not 3.

3. **Mutually exclusive flags use generic `Error` in resolver (low — acceptable)**
   - `resolveGraphCliContext` throws `new Error('--config and --path are mutually exclusive')`; handler maps to `cliError` exit 1 — matches verify scenario.

### Test Coverage

**File:** `packages/cli/test/commands/graph-index.spec.ts`

| Scenario                                                   | Covered |
| ---------------------------------------------------------- | ------- |
| Delegates to `runIndexProjectGraph` (configured/bootstrap) | ✅      |
| `--exclude-path`, `--force` forwarding                     | ✅      |
| Text summary block shape                                   | ✅      |
| Lock acquisition                                           | ✅      |
| Lock failure → exit 3                                      | ✅      |
| No `--workspace` option                                    | ✅      |

### Missing Tests

- Worker subprocess spawn (`SPECD_GRAPH_INDEX_WORKER`, `SPECD_GRAPH_INDEX_LOCK_HELD`)
- `SIGINT` / `SIGTERM` forwarding to worker
- `onProgress` callback output (`Indexing: N% phase`)
- Infrastructure error → exit 3 (indexing failure path)
- Per-file errors in result → exit 0
- JSON output field presence
- `openSpecdHost` in worker (integration-level)
- CLI reference doc presence (static/doc test)

### Summary (cli:graph-index)

| Metric               | Count                         |
| -------------------- | ----------------------------- |
| Requirements         | 6                             |
| Implemented          | 5 (1 partial)                 |
| Discrepancies        | 2 impl bugs (1 medium, 1 low) |
| Scenarios with tests | 8 / ~16                       |
| Missing test areas   | 8                             |

---

## cli:graph-stats

### Requirements Summary

| #   | Requirement                                                                                                    | Priority |
| --- | -------------------------------------------------------------------------------------------------------------- | -------- |
| R1  | Command signature; `--config` / `--path` mutually exclusive                                                    | MUST     |
| R2  | Host via `openSpecdHost`; stats via `withOpenGraphProvider` + `GetGraphHealth.execute()` with `ListWorkspaces` | MUST     |
| R3  | Concurrent indexing guard (fail fast before provider open)                                                     | SHALL    |
| R4  | Text labelled summary; staleness + fingerprint warnings; JSON/toon extra fields                                | MUST     |
| R5  | Lock present / infrastructure failure → exit 3                                                                 | MUST     |
| R6  | Lifecycle via `cli:graph-cli-context` module                                                                   | MUST     |

### Implementation Status

| Req | Status           | Evidence                                                                                                                                             |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ⚠️ Broken source | Handler logic present but **file fails `tsc`** — missing imports                                                                                     |
| R2  | ⚠️ Broken source | Intended: `resolveGraphCliContext` → `resolveSdkHostContext` → `withOpenGraphProvider` → `createGetGraphHealth().execute()` with workspaces (L44–85) |
| R3  | ⚠️ Broken source | `assertGraphIndexUnlocked(config)` before open (L58)                                                                                                 |
| R4  | ⚠️ Broken source | Text/json/toon formatting logic matches spec (L89–125)                                                                                               |
| R5  | ⚠️ Broken source | Lock → `cliError` exit 3 (L60); catch → exit 3 (L128–132)                                                                                            |
| R6  | ⚠️ Partial       | Uses `resolveGraphCliContext` ✅; **bypasses `withProvider`** — calls `withOpenGraphProvider` directly (L66)                                         |

### Discrepancies

1. **CRITICAL: Missing imports — package does not typecheck (impl bug)**
   - **File:** `packages/cli/src/commands/graph/stats.ts`
   - **Missing:** `parseFormat`, `cliError`, `resolveGraphCliContext`, `resolveSdkHostContext`, `output`
   - **Verified:** `pnpm typecheck` in `packages/cli` reports TS2304/TS2552 errors on this file.
   - **Note:** Tests pass via heavy mocking and may run against stale `dist/`; source is not buildable.

2. **`withProvider` bypass (medium — impl vs graph-cli-context spec)**
   - **Spec says:** Graph context and provider lifecycle MUST go through `cli:graph-cli-context`.
   - **Code does:** `stats` uses `withOpenGraphProvider` directly, not `withProvider` from `with-provider.ts`.
   - **Impact:** Skips CLI signal handlers / unified fatal reporting path used by `search`, `impact`, `hotspots`.

3. **`openSpecdHost` not used directly (low — acceptable)**
   - Uses `resolveSdkHostContext` helper which wraps `createSdkContext` / kernel — still SDK-hosted, but verify scenario names `openSpecdHost` explicitly.

### Test Coverage

**File:** `packages/cli/test/commands/graph-stats.spec.ts` — extensive mocked tests:

| Scenario                    | Covered |
| --------------------------- | ------- |
| Config/path resolution      | ✅      |
| Lock check before provider  | ✅      |
| Mutual-exclusive flags      | ✅      |
| Staleness (JSON + text)     | ✅      |
| Fingerprint mismatch stderr | ✅      |
| Lock failure → exit 3       | ✅      |
| Document counts in text     | ✅      |

### Missing Tests

- Integration test against non-mocked `stats.ts` (would catch missing imports)
- `withProvider` / `cli:graph-cli-context` lifecycle delegation
- Infrastructure error → exit 3 with `fatal:` prefix
- `ListWorkspaces` passed to `GetGraphHealth` (assert call args, not just mock behaviour)
- JSON schema help text (cross-spec)

### Summary (cli:graph-stats)

| Metric               | Count                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Requirements         | 6                                                                             |
| Implemented          | 0 buildable (logic present but broken); 4 would be compliant if imports fixed |
| Discrepancies        | 3 (1 critical impl bug, 1 medium architectural, 1 low)                        |
| Scenarios with tests | 12 / ~15 (mock-only)                                                          |
| Missing test areas   | 5                                                                             |

---

## cli:host-context

### Requirements Summary

| #   | Requirement                                                                          | Priority |
| --- | ------------------------------------------------------------------------------------ | -------- |
| R1  | `resolveCliContext` delegates to `openSpecdHost` with `configPath` + `kernelOptions` | MUST     |
| R2  | CLI kernel options (verbosity, TTY format, `onLog`) preserved in CLI layer           | MUST     |
| R3  | Commands obtain host via `resolveCliContext` or `openSpecdHost`                      | MUST     |
| R4  | `@specd/cli` depends only on `@specd/sdk` for specd platform packages                | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                        |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `packages/cli/src/helpers/cli-context.ts` L86–98                                                                                                |
| R2  | ✅ Implemented | `buildCliKernelOptions` — verbosity → log levels, TTY pretty/json, `onLog` destination (L49–76)                                                 |
| R3  | ✅ Implemented | Widespread `resolveCliContext`; `project status` uses `openSpecdHost` directly (allowed)                                                        |
| R4  | ✅ Implemented | `packages/cli/package.json` — only `@specd/sdk` among `@specd/*` platform deps; no `@specd/core` / `@specd/code-graph` direct imports in `src/` |

### Discrepancies

None material.

### Test Coverage

**File:** `packages/cli/test/helpers/cli-context.spec.ts`

| Scenario                                              | Covered |
| ----------------------------------------------------- | ------- |
| `-vv` → trace level via `openSpecdHost` kernelOptions | ✅      |
| `extraNodeModulesPaths` in kernel options             | ✅      |

### Missing Tests

- `onLog` callback receives kernel log entries
- `resolveCliContext` returns `{ config, configFilePath, kernel }` shape
- `configPath` forwarded to `openSpecdHost`

### Summary (cli:host-context)

| Metric               | Count |
| -------------------- | ----- |
| Requirements         | 4     |
| Implemented          | 4     |
| Discrepancies        | 0     |
| Scenarios with tests | 2 / 5 |
| Missing test areas   | 3     |

---

## cli:graph-cli-context

### Requirements Summary

| #   | Requirement                                                                                       | Priority |
| --- | ------------------------------------------------------------------------------------------------- | -------- |
| R1  | `resolveGraphCliContext` uses SDK imports; bootstrap → synthetic `default` workspace              | MUST     |
| R2  | `withProvider` delegates to `withOpenGraphProvider`                                               | MUST     |
| R3  | Graph handlers (`search`, `hotspots`, `impact`, `stats`, `index`) use shared module / SDK symbols | MUST     |
| R4  | Lock helpers imported from `@specd/sdk` barrel                                                    | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                       |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1  | ✅ Implemented | `resolve-graph-cli-context.ts` — SDK imports; `createBootstrapGraphConfig` for bootstrap (L81–91)                              |
| R2  | ✅ Implemented | `with-provider.ts` L45–47 calls `withOpenGraphProvider`; SIGINT/SIGTERM handlers (L41–42, L54–56); `process.exit(0)` (L56)     |
| R3  | ⚠️ Partial     | `search`, `hotspots`, `impact` use `resolveGraphCliContext` + `withProvider` ✅; **`stats` and `index` bypass `withProvider`** |
| R4  | ✅ Implemented | `assertGraphIndexUnlocked` / `acquireGraphIndexLock` from `@specd/sdk` in `stats.ts` / `index-graph.ts`                        |

### Discrepancies

1. **Inconsistent lifecycle entry point (medium — impl bug / incomplete migration)**
   - **Spec says:** All five graph handlers obtain shared lifecycle via this module.
   - **Code does:** `stats` and `index` open graph lifecycle outside `withProvider`.
   - **Files:** `packages/cli/src/commands/graph/stats.ts`, `index-graph.ts` vs `search.ts`, `impact.ts`, `hotspots.ts`.

2. **Bootstrap mutual-exclusive error is generic `Error` (low)**
   - Thrown in `resolveGraphCliContext` L39; callers map to `cliError` — acceptable pattern.

### Test Coverage

**File:** `packages/cli/test/commands/graph-cli-context.spec.ts`

| Scenario                                 | Covered             |
| ---------------------------------------- | ------------------- |
| `withProvider` → `withOpenGraphProvider` | ✅                  |
| Bootstrap mode resolution smoke test     | ✅ (weak assertion) |

### Missing Tests

- Configured mode uses `resolveCliContext`
- Bootstrap synthetic `default` workspace `codeRoot` at VCS root
- `stats` / `index` lifecycle consistency (negative test — currently fail spec intent)
- Lock helpers imported from SDK barrel (static import assertion)
- Signal handler behaviour on `withProvider`

### Summary (cli:graph-cli-context)

| Metric               | Count         |
| -------------------- | ------------- |
| Requirements         | 4             |
| Implemented          | 3 (1 partial) |
| Discrepancies        | 1 medium      |
| Scenarios with tests | 2 / 8         |
| Missing test areas   | 5             |

---

## cli:entrypoint

### Requirements Summary

| #   | Requirement                                                                 | Priority |
| --- | --------------------------------------------------------------------------- | -------- |
| R1  | Config discovery walking up to git root                                     | MUST     |
| R2  | Global `--config` with `preAction` propagation                              | MUST     |
| R3  | stdout/stderr separation                                                    | MUST     |
| R4  | Exit codes 0/1/2/3 uniform                                                  | MUST     |
| R5  | `error:` / `fatal:` prefixes; stack trace gated on debug                    | MUST     |
| R6  | `--format text\|json\|toon` on commands                                     | MUST     |
| R7  | Structured errors via `SpecdCliError`; eliminate generic `Error` in helpers | SHALL    |
| R8  | JSON/TOON output schema in command `--help`                                 | MUST     |
| R9  | `@specd/cli` and `@specd/mcp` depend only on `@specd/sdk`                   | MUST     |
| R10 | Excess arguments rejected                                                   | MUST     |
| R11 | Banner on root `--help` only                                                | MUST     |
| R12 | Auto-dashboard on bare `specd`                                              | MUST     |
| R13 | Top-level `init` alias                                                      | MUST     |

### Implementation Status

| Req | Status         | Evidence                                                                                                                                                                           |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | ✅ Implemented | `load-config.ts` / `createConfigLoader` via SDK in `index.ts` L249–254                                                                                                             |
| R2  | ✅ Implemented | `index.ts` L95–96, L103–111 `preAction` hook                                                                                                                                       |
| R3  | ✅ Implemented | `handle-error.ts`, `formatter.ts` patterns                                                                                                                                         |
| R4  | ✅ Implemented | `handle-error.ts` L165–205 mapping                                                                                                                                                 |
| R5  | ✅ Implemented | `cliError` prefix logic (L44); debug stack via `Logger.isLevelEnabled('debug')` (L196–199)                                                                                         |
| R6  | ✅ Implemented | Widespread `parseFormat` usage                                                                                                                                                     |
| R7  | ⚠️ Partial     | `SpecdCliError` / `CliValidationError` exist; **generic `Error` still thrown** in `resolve-graph-cli-context.ts`, `resolve-impact-file-selectors.ts`, several spec/change commands |
| R8  | ⚠️ Partial     | Some commands have schema help (`graph stats` L21–37, `dashboard`, `context`); **`project status` and `graph index` lack it**                                                      |
| R9  | ✅ Implemented | `packages/cli/package.json`, `packages/mcp/package.json` — only `@specd/sdk`                                                                                                       |
| R10 | ✅ Implemented | `.allowExcessArguments(false)` on leaf commands                                                                                                                                    |
| R11 | ✅ Implemented | `index.ts` L98–101 banner on root program only                                                                                                                                     |
| R12 | ✅ Implemented | `index.ts` L232–256 default action → dashboard or help                                                                                                                             |
| R13 | ✅ Implemented | `registerProjectInit(program)` L197                                                                                                                                                |

### Discrepancies

1. **Invalid format error code (spec drift vs impl — low)**
   - **Verify says:** Error code `INVALID_FORMAT` from `SpecdCliError`.
   - **Code does:** `CliValidationError.code` returns `CLI_VALIDATION_ERROR` (`packages/cli/src/errors/cli-validation-error.ts` L12–14).
   - **Assessment:** Behaviour correct; code string differs from verify scenario.

2. **Generic `Error` throws remain (medium — partial compliance)**
   - **Spec says:** Generic `Error` MUST be eliminated from formatters, command helpers, argument validation.
   - **Code does:** Multiple `throw new Error(...)` in graph helpers and command handlers (e.g. `resolve-graph-cli-context.ts`, `resolve-impact-file-selectors.ts`).
   - **Assessment:** Ongoing migration gap; not blocking happy paths because callers catch and re-map.

3. **JSON/TOON help schema incomplete (medium — impl gap)**
   - Audited commands `project status`, `graph index` missing required help schema blocks.

### Test Coverage

**Files:** `packages/cli/test/entrypoint.spec.ts`, `packages/cli/test/handle-error.spec.ts`

| Scenario                        | Covered           |
| ------------------------------- | ----------------- |
| `preAction` config propagation  | ✅                |
| Banner root vs subcommand       | ✅                |
| Auto-dashboard with `--config`  | ✅                |
| Top-level `init` in help        | ✅                |
| Domain/hook/system exit codes   | ✅                |
| Structured JSON error on stdout | ✅ (handle-error) |

### Missing Tests

- Bare `specd` without config → help (verify scenario)
- `specd init` delegation end-to-end
- `INVALID_FORMAT` / `CLI_VALIDATION_ERROR` code assertion
- JSON/TOON schema presence in help for all format-supporting commands
- Config discovery walk-up integration test
- MCP package dependency boundary test

### Summary (cli:entrypoint)

| Metric               | Count                                |
| -------------------- | ------------------------------------ |
| Requirements         | 13                                   |
| Implemented          | 11 (2 partial)                       |
| Discrepancies        | 3 (1 low code-string, 2 medium gaps) |
| Scenarios with tests | ~12 / ~22                            |
| Missing test areas   | 6                                    |

---

## Aggregate Summary

| Spec                  | Reqs   | Implemented | Discrepancies | Critical issues                             |
| --------------------- | ------ | ----------- | ------------- | ------------------------------------------- |
| cli:project-status    | 12     | 12          | 3 (low)       | 0                                           |
| cli:graph-index       | 6      | 5           | 2             | 0                                           |
| cli:graph-stats       | 6      | 0\*         | 3             | **1 — missing imports / typecheck failure** |
| cli:host-context      | 4      | 4           | 0             | 0                                           |
| cli:graph-cli-context | 4      | 3           | 1             | 0                                           |
| cli:entrypoint        | 13     | 11          | 3             | 0                                           |
| **Total**             | **45** | **35**      | **12**        | **1**                                       |

\*graph-stats logic is written but source does not compile.

### Top findings (priority order)

1. **`graph stats` source broken** — missing imports; `pnpm typecheck` fails in `@specd/cli`.
2. **`graph index` infrastructure errors** — catch block exits 1 instead of spec-mandated 3.
3. **Graph lifecycle inconsistency** — `stats` / `index` bypass `withProvider` from `cli:graph-cli-context`.
4. **Entrypoint structured-error migration incomplete** — generic `Error` throws remain; help schema missing on some commands.
5. **`project status` text mode** — may show `fresh` when graph health is unavailable (`graphHealth: null`).

### SDK orchestration (cross-cutting — compliant)

- `buildProjectStatusSnapshot` correctly wires `getProjectSummary`, `ListWorkspaces`, `GetGraphHealth`, hotspots (`packages/sdk/src/orchestration/build-project-status-snapshot.ts`).
- `runIndexProjectGraph` centralizes index orchestration (`packages/sdk/src/orchestration/run-index-project-graph.ts`).
- SDK barrel re-exports core/code-graph symbols for CLI consumption (`packages/sdk/src/index.ts`).
