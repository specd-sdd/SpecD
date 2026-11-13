# Tasks: bound-indexer-ast-resource-lifecycle

Paths are from the repository root. Run `pnpm build && pnpm typecheck` after groups 1 to 11 and `pnpm test` after each test group. Re-run `graph impact` on the final file set before the last task.

## 1. Domain types (code-graph)

- [x] 1.1 Add the parser-resource scope contract
      `packages/code-graph/src/domain/value-objects/parser-resource-scope.ts`: new — `ParserResourceDisposer`, `ParserResourceDisposalFailure`, `ParserResourceCloseResult`, `ParserResourceScope`
      Approach: copy the type definitions from design.md "New constructs"; interface only, no implementation, no dependency on any parsing library, full JSDoc on every member
      (Req: Parser resource lifecycle)
- [x] 1.2 Add the typed indexing events and the size-skip result types
      `packages/code-graph/src/domain/value-objects/index-event.ts`: new — `FileActivityEvent`, `FileSkippedEvent`, `ResourceDisposalFailedEvent`, `IndexEvent`, `IndexEventReceiver`, `SizeSkippedFile`, `SizeExemptFile`
      Approach: JSON-primitive fields only (`kind` discriminator, `sizeBytes: number | null` on `file-activity`); definitions exactly as in design.md
      (Req: Typed indexing events; Index result)
- [x] 1.3 Add the isolated-worker value types
      `packages/code-graph/src/domain/value-objects/graph-index-worker-types.ts`: new — `GraphIndexFailureCause`, `GraphIndexWorkerDiagnostics`, `GraphIndexWorkerEvent`, `GraphIndexTaskAnnouncer`
      Approach: types only; `GraphIndexWorkerEvent` has the three kinds `activity`, `worker-silent`, `stale-lock-recovered`; `GraphIndexTaskAnnouncer = (item: string, options?: { readonly mandatory?: boolean }) => void`
      (Req: Typed worker events; Typed failure classification; Activity and silence watchdog)
- [x] 1.4 Add `parserResources` to `IndexSession`
      `packages/code-graph/src/domain/value-objects/index-session.ts`: `IndexSession` — add `readonly parserResources: ParserResourceScope` with JSDoc
      Approach: additive member; leave `getAdapterState`/`setAdapterState` untouched
      (Req: Parser resource lifecycle; Parser-owned resource registration)
- [x] 1.5 Extend `ProjectGraphConfig` and `IndexOptions`
      `packages/code-graph/src/domain/value-objects/index-options.ts`: `ProjectGraphConfig` — add `maxFileBytes?: number` and `largeFilePaths?: readonly string[]` to the root and to each `workspaces` entry; `IndexOptions` — add `onEvent?: IndexEventReceiver`
      Approach: all new members optional; document unit (bytes), `0` semantics and the pattern base directories in JSDoc
      (Req: Per-file size limit; Typed indexing events)
- [x] 1.6 Extend `IndexResult`
      `packages/code-graph/src/domain/value-objects/index-result.ts`: `IndexResult` — add `filesSkippedForSize: number`, `largestSkippedForSize: readonly SizeSkippedFile[]`, `sizeExemptAnalysed: readonly SizeExemptFile[]`
      Approach: required members; export `SIZE_SKIP_LIST_LIMIT = 25`; fix every literal that the compiler reports (return sites in `index-code-graph.ts` are handled in group 7; test fixtures in group 12)
      (Req: Index result)
- [x] 1.7 Add the worker error base class and diagnostics
      `packages/code-graph/src/domain/errors/isolated-graph-index-errors.ts`: new abstract `GraphIndexWorkerError extends SpecdCodeGraphError` with `get diagnostics()` and `withDiagnostics(d): this` (attach once, ignore later calls); change the seven worker error classes to extend it
      Approach: keep every existing code string, constructor and getter; the diagnostics field is private and optional
      (Req: Typed failure classification)
- [x] 1.8 Export the new domain types from the barrels
      `packages/code-graph/src/domain/value-objects/index.ts` and `packages/code-graph/src/domain/index.ts`: export all constructs from 1.1 to 1.3
      Approach: named re-exports only
      (Req: Typed indexing events; Typed worker events)

## 2. Parser resource scope and helpers (code-graph application)

- [x] 2.1 Implement the in-memory scope
      `packages/code-graph/src/application/use-cases/in-memory-parser-resource-scope.ts`: new — `InMemoryParserResourceScope implements ParserResourceScope`
      Approach: `close()` swaps `this.entries` for a new array first, iterates the old one in reverse, runs each disposal in its own try/catch, collects failures `{ index, message }`, returns `{ registered, failures }`; `size` returns the current entries length
      (Req: Parser resource lifecycle)
- [x] 2.2 Wire the scope into the session
      `packages/code-graph/src/application/use-cases/in-memory-index-session.ts`: `InMemoryIndexSession` — add `readonly parserResources: ParserResourceScope = new InMemoryParserResourceScope()`
      Approach: field initializer; no change to adapter-state methods
      (Req: Parser resource lifecycle)
- [x] 2.3 Add the garbage-collection helper
      `packages/code-graph/src/application/services/request-garbage-collection.ts`: new — `requestGarbageCollection(): void`
      Approach: read the optional global through a typed ambient declaration in this file (no `any`, no lint-disable if avoidable); call it only when it is a function
      (Req: Parser resource lifecycle)
- [x] 2.4 Add the epoch-closing helper
      `packages/code-graph/src/application/services/close-parser-resource-epoch.ts`: new — `closeParserResourceEpoch(scope, onDisposalFailure?)`
      Approach: return `{ registered: 0, failures: [] }` without a collection when `scope.size === 0`; otherwise `scope.close()`, report each failure to the callback, then `requestGarbageCollection()`, then return the result
      (Req: Parser resource lifecycle)

## 3. Adapter migration (code-graph infrastructure)

- [x] 3.1 TypeScript adapter registers its parse result
      `packages/code-graph/src/infrastructure/tree-sitter/typescript-language-adapter.ts`: `analyzeFile` (keepalive block after `const sgRoot = parse(lang, content)`, ~line 979)
      Approach: replace the five-line keepalive block and its V8-finalizer comment with `context.session.parserResources.register(sgRoot)` directly after the `parse(...)` call and before any traversal, and a one-line comment pointing at the resource scope
      (Req: Parser-owned resource registration; Supported languages and deterministic analysis of code-graph:typescript-language-adapter)
- [x] 3.2 Python adapter registers its parse result
      `packages/code-graph/src/infrastructure/tree-sitter/python-language-adapter.ts`: `analyzeFile` (~line 668)
      Approach: same replacement and placement as 3.1
      (Req: Parser-owned resource registration; Supported files and deterministic analysis of code-graph:python-language-adapter)
- [x] 3.3 Go adapter registers its parse result
      `packages/code-graph/src/infrastructure/tree-sitter/go-language-adapter.ts`: `analyzeFile` (~line 580)
      Approach: same replacement and placement as 3.1
      (Req: Parser-owned resource registration; Supported files and deterministic analysis of code-graph:go-language-adapter)
- [x] 3.4 PHP adapter registers its parse result
      `packages/code-graph/src/infrastructure/tree-sitter/php-language-adapter.ts`: `analyzeFile` (~line 795)
      Approach: same replacement and placement as 3.1; Pass 2 and `buildRelations` must keep working from the parser-derived facts only, with no parsed syntax tree available after `analyzeFile` returns
      (Req: Parser-owned resource registration; Supported files and deterministic analysis and PHP parser-authoritative structural extraction of code-graph:php-language-adapter)
- [x] 3.5 Confirm no keepalive remains
      `packages/code-graph/src`: whole tree
      Approach: search for `napi-keepalive` and `keepAlive`; the only remaining occurrence allowed is none (the line in `index-code-graph.ts` is removed in group 7)
      (Req: Parser resource lifecycle)

## 4. Core configuration

- [x] 4.1 Add the two keys to both strict zod schemas
      `packages/core/src/application/ports/config-schema.ts`: `WorkspaceGraphZodSchema` and `ProjectGraphZodSchema`
      Approach: add `maxFileBytes: z.number().int().nonnegative().optional()` and `largeFilePaths: z.array(z.string()).optional()` to both objects; keep `.strict()`
      (Req: Graph file size limit; Graph size limit fields)
- [x] 4.2 Add the fields to the config types with full JSDoc
      `packages/core/src/application/specd-config.ts`: `SpecdWorkspaceGraphConfig` and `SpecdGraphConfig`
      Approach: `readonly maxFileBytes?: number` and `readonly largeFilePaths?: readonly string[]`; JSDoc states bytes, `0` disables, omitted means the code graph applies its default, and the pattern base directory
      (Req: Graph file size limit)
- [x] 4.3 Map the workspace-level fields in the loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: workspace graph mapping block (~lines 457-471)
      Approach: add two conditional spreads in the style of the neighbouring fields; apply no default
      (Req: Graph size limit fields)
- [x] 4.4 Map the project-level fields in the loader
      `packages/core/src/infrastructure/fs/config-loader.ts`: project graph mapping block (~lines 627-636)
      Approach: add two conditional spreads for `data.graph?.maxFileBytes` and `data.graph?.largeFilePaths`
      (Req: Graph size limit fields)
- [x] 4.5 Check the cascade needs no change
      `packages/core/src/infrastructure/fs/config-cascade.ts`: layer merge
      Approach: confirm with a test (group 12) that a later scalar wins and arrays append; modify the file only if the test fails
      (Req: Graph file size limit; Graph size limit fields)

## 5. Effective graph configuration, builders, fingerprint, visibility (code-graph application)

- [x] 5.1 Resolve the size settings in the effective config
      `packages/code-graph/src/application/use-cases/_shared/resolve-effective-graph-config.ts`: `EffectiveWorkspaceGraphConfig`, `EffectiveGraphConfig`, `resolveEffectiveGraphConfig`
      Approach: export `DEFAULT_MAX_FILE_BYTES = 262144`; add `maxFileBytes`, `projectLargeFilePaths`, `workspaceLargeFilePaths` per workspace and `rootMaxFileBytes`, `rootLargeFilePaths`; workspace value, else project value, else default; copy arrays; this is the only place the default is applied
      (Req: Effective size limit resolution)
- [x] 5.2 Map the config fields into `ProjectGraphConfig`
      `packages/code-graph/src/application/services/build-project-graph-config.ts`: `buildProjectGraphConfig`
      Approach: copy `config.graph?.maxFileBytes`/`largeFilePaths` and the same fields of each `workspace.graph` with conditional spreads; no default
      (Req: Effective size limit resolution)
- [x] 5.3 Include the size settings in the fingerprints
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `NormalizedWorkspaceFingerprint`, `normalizeWorkspaceFingerprintInput`, `computeGraphFingerprint`, `computeWorkspaceFingerprint`, `computeRootFingerprint`
      Approach: add `maxFileBytes` and `largeFilePaths { project, workspace }` to the normalized workspace object; add `rootMaxFileBytes`/`rootLargeFilePaths` to the `g` payload; add `maxFileBytes`/`largeFilePaths` to the `root` payload; keep declared order
      (Req: Discovery fingerprint uses effective config; Effective size limit resolution)
- [x] 5.4 Hide size-skipped files from the visibility snapshot
      `packages/code-graph/src/application/services/graph-input-visibility.ts`: `buildGraphInputVisibilitySnapshot`
      Approach: create the gate from the effective config (task 6.1) and drop `skip` decisions from `currentInputs` so `isVisible` is false for them
      (Req: Per-file size limit)

## 6. Size gate (code-graph application)

- [x] 6.1 Implement the gate
      `packages/code-graph/src/application/services/file-size-gate.ts`: new — `FileSizeDecision`, `FileSizeGateInput`, `FileSizeGate`, `createFileSizeGate(effective, readSize?)`
      Approach: limit from the workspace entry or `rootMaxFileBytes`; `size > limit` and `limit !== 0` to exceed; unreadable size gives `within-limit` with `null`; exemption through two `ignore()` matchers (project list against `projectRelativePath`, skipped when it starts with `../`; workspace list against `relativeToCodeRoot`), built lazily and cached per workspace; default `readSize` is `statSync(path).size` inside try/catch
      (Req: Per-file size limit)

## 7. IndexCodeGraph (code-graph application)

- [x] 7.1 Create the gate and per-run maps
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `IndexCodeGraph.execute`, after `effectiveGraphConfig`
      Approach: `const sizeGate = createFileSizeGate(effectiveGraphConfig)`; `fileSizes: Map<string, number | null>`, `sizeSkipped: Map<string, SizeSkippedFile>`, `sizeExempt: Map<string, SizeExemptFile>`; hoist the declaration of `coverageByFilePath` above discovery
      (Req: Per-file size limit)
- [x] 7.2 Apply the gate in workspace discovery
      `index-code-graph.ts`: workspace discovery loop (`allDiscoveredPaths.push(prefixed)` ~line 544)
      Approach: call `sizeGate.decide` before pushing; `within-limit`/`exempt` record the size (and the exempt entry) and continue as today; `skip` sets only `projectRelativePaths`, records `sizeSkipped`, emits `file-skipped`, and does not push into `allDiscoveredPaths` or `absolutePaths`; `wsBreakdowns.filesDiscovered` keeps counting every discovered file
      (Req: Per-file size limit)
- [x] 7.3 Apply the gate in project-global discovery
      `index-code-graph.ts`: root discovery loop (~line 582)
      Approach: same as 7.2 with `workspaceName: 'root'` and paths relative to the project root
      (Req: Per-file size limit)
- [x] 7.4 Record coverage for skipped files on every run
      `index-code-graph.ts`: after discovery
      Approach: for each `sizeSkipped` entry `coverageByFilePath.set(path, { filePath, contentHash: undefined, status: IndexCoverageStatus.Unsupported, reason: 'file-too-large', capabilities: [] })`; also include the skipped paths when querying `existingCoverage` so a stale `indexed` row is replaced
      (Req: Per-file size limit)
- [x] 7.5 Fix deletion detection for size-skipped paths
      `index-code-graph.ts`: incremental branch (`existingPaths` loop, ~line 740)
      Approach: skipped path still in the store as file or document (`existingArtifactHashes.has`) goes to `deletedFiles` (its nodes are removed and counted in `filesRemoved`); a coverage-only skipped row is left alone so it does not trigger `deletedFiles` or the semantic refresh on every run
      (Req: Size skip in incremental runs and dependents)
- [x] 7.6 Reuse sizes for chunk grouping
      `index-code-graph.ts`: `groupIntoChunks` (~line 396) and its call (~line 865)
      Approach: add a size-lookup parameter keyed by absolute path built from `fileSizes`/`absolutePaths`; call `statSync` only when the size is `null`
      (Req: Per-file size limit)
- [x] 7.7 Hold the session for the run-level safety net
      `index-code-graph.ts`: session creation (~line 1055) and the outer `finally`
      Approach: declare `let activeSession: IndexSession | undefined` before the outer `try`; assign at creation; in the existing `finally`, before the stage-directory cleanup, call `closeParserResourceEpoch(activeSession.parserResources)` when defined
      (Req: Parser resource lifecycle)
- [x] 7.8 Emit `file-activity` and keep the progress counters complete
      `index-code-graph.ts`: top of the per-file loop (`processed++`)
      Approach: add an `emitEvent` helper (`try { options.onEvent?.(event) } catch { Logger.debug(...) }`); emit `{ kind: 'file-activity', filePath, sizeBytes: fileSizes.get(prefixedPath) ?? null, index: processed, total: totalToProcess }` for every file before any read; no throttle
      (Req: Typed indexing events)
- [x] 7.9 Close the epoch in a per-file `finally` and move the yield there
      `index-code-graph.ts`: per-file `try { ... } catch (err) { ... }` block and the trailing `if (processed % 50 === 0) { await setImmediate }`
      Approach: append `finally { closeParserResourceEpoch(session.parserResources, (f) => emitEvent({ kind: 'resource-disposal-failed', filePath: prefixedPath, message: f.message })); if (processed % 50 === 0) await new Promise<void>((r) => setImmediate(r)) }`; delete the old trailing yield; `finally` also runs for the existing `continue` paths so early-exit files close the epoch and yield
      (Req: Parser resource lifecycle; Bounded analysis memory)
- [x] 7.10 Remove the run-wide keepalive clear
      `index-code-graph.ts`: success path (~line 2031)
      Approach: delete `session.setAdapterState('napi-keepalive', null)`
      (Req: Parser resource lifecycle)
- [x] 7.11 Fill the new result fields in every return site
      `index-code-graph.ts`: result construction (~line 2035) and any early-return result
      Approach: `filesSkippedForSize = sizeSkipped.size`; `largestSkippedForSize` sorted by `sizeBytes` desc then `filePath` asc, sliced to `SIZE_SKIP_LIST_LIMIT`; `sizeExemptAnalysed` sorted the same way, only entries that exceeded their limit; `filesDiscovered` = kept paths + `sizeSkipped.size`
      (Req: Index result)
- [x] 7.12 Update progress documentation comments
      `index-code-graph.ts`: JSDoc of `execute` and the Pass 1 section
      Approach: describe the size gate, the per-file epoch and the yield-after-close rule in the JSDoc
      (Req: Bounded analysis memory)

## 8. IndexProjectGraph and SDK

- [x] 8.1 Forward `onEvent` in the use case
      `packages/code-graph/src/application/use-cases/index-project-graph.ts`: `IndexProjectGraphInput`, `IndexProjectGraph.execute`
      Approach: add `readonly onEvent?: IndexEventReceiver`; build `IndexOptions` with `...(input.onEvent !== undefined ? { onEvent: input.onEvent } : {})`
      (Req: Executes project indexing; Accepts open provider and prepared inputs)
- [x] 8.2 Forward `onEvent` in the SDK orchestration
      `packages/sdk/src/orchestration/run-index-project-graph.ts`: `RunIndexProjectGraphInput`, `executeIndex`
      Approach: add `readonly onEvent?: IndexEventReceiver` with JSDoc; forward it to `indexProjectGraph.execute`; leave `onProgress` and the result mapping untouched
      (Req: Typed event passthrough; Progress callback passthrough; Result passthrough)

## 9. Isolated worker (code-graph infrastructure)

- [x] 9.1 Bump the protocol and add the `activity` message
      `packages/code-graph/src/infrastructure/isolated-index-worker/protocol.ts`: `GRAPH_INDEX_PROTOCOL`, `ChildMessage`, `isChildMessage`
      Approach: identifier `'specd.graph-index.v2'`; add `{ protocol, type: 'activity', item: string }`; accept it only with the exact key set and a non-empty string of at most 4096 characters
      (Req: Validated IPC lifecycle)
- [x] 9.2 Extend the task and runner port types
      `packages/code-graph/src/application/ports/isolated-graph-index-runner.ts`: `GraphIndexTask`, `RunIsolatedGraphIndexInput`
      Approach: third parameter `announce: GraphIndexTaskAnnouncer` on `GraphIndexTask`; optional `onEvent?: (event: GraphIndexWorkerEvent) => void` on the input
      (Req: Typed worker events; Activity and silence watchdog)
- [x] 9.3 Implement the child announcer
      `packages/code-graph/src/infrastructure/isolated-index-worker/isolated-index-worker-child.ts`: new `announce`, `runTask`
      Approach: `ACTIVITY_MIN_INTERVAL_MS = 250`; mandatory announcements always sent; ordinary ones dropped when sent less than 250 ms ago; truncate items to 4096 characters; ignore empty items and calls after the terminal message; swallow send exceptions; pass `announce` as the third argument of `runGraphIndexTask`
      (Req: Activity and silence watchdog)
- [x] 9.4 Add the output tail buffer
      `packages/code-graph/src/infrastructure/isolated-index-worker/output-tail.ts`: new — `OutputTail`
      Approach: keep the last 16384 bytes; decode with `new TextDecoder('utf-8', { fatal: false })`; `dispose()` drops the buffer
      (Req: Child output capture)
- [x] 9.5 Add the failure classifier
      `packages/code-graph/src/infrastructure/isolated-index-worker/classify-failure.ts`: new — `classifyWorkerFailure`
      Approach: first match wins in this order: start error, task contract, task execution, protocol/progress-handler, forwarded signal (`cancelled`), out-of-memory pattern in the stderr tail (`resource-limit`), native-crash signals or exit codes `3221225477` and `134`, otherwise `exited`
      (Req: Typed failure classification)
- [x] 9.6 Fork the child with pipes and the garbage-collection argument
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`: `runtime.fork(...)` call (~line 283)
      Approach: `stdio: ['ignore', 'pipe', 'pipe', 'ipc']`; `execArgv: [...process.execArgv, '--expose-gc']` without duplicating the flag, preserving the host's arguments; widen the `runtime.process` type to include `execArgv`
      (Req: Child runtime options; Child output capture)
- [x] 9.7 Capture stdout and stderr
      `supervisor.ts`: after the fork
      Approach: `child.stdout?.on('data', ...)` and `child.stderr?.on('data', ...)` feed two `OutputTail`s; never write them to the host streams; remove the listeners and dispose both tails in `finalize` after diagnostics are built
      (Req: Child output capture)
- [x] 9.8 Track activity and deliver typed events
      `supervisor.ts`: `onMessage`
      Approach: set `lastMessageAt` on every valid message; on `activity` set `lastActivity` and call `input.onEvent?.({ kind: 'activity', item })`; a throwing `onEvent` becomes a `GraphIndexProgressHandlerError` ("The graph-index event handler threw.") and terminates the child like a throwing progress handler
      (Req: Activity and silence watchdog; Typed worker events)
- [x] 9.9 Add the supervisor silence watchdog
      `supervisor.ts`: after a successful fork; `IsolatedGraphIndexRuntime`
      Approach: optional `runtime.timers { setInterval, clearInterval, now }` defaulting to globals; check every 1000 ms; when silent for at least 10000 ms and the last warning is at least 10000 ms old, deliver `{ kind: 'worker-silent', item: lastActivity?.item ?? null, silentForMs }`; clear the interval in `finalize`; never kill the child
      (Req: Activity and silence watchdog)
- [x] 9.10 Deliver the stale-lock recovery as a typed event too
      `supervisor.ts`: the `acquireLock` callback
      Approach: keep `onWarning(formatStaleLockWarning(info))`, and also call `onEvent` with `{ kind: 'stale-lock-recovered', reason, lockPath, pid?, startedAt? }`
      (Req: Typed worker events)
- [x] 9.11 Attach cause and diagnostics to failures
      `supervisor.ts`: `onError`, `onExit`, `protocolFailure`, task-failure mapping, progress-handler failure
      Approach: `attach(error)` calls `error.withDiagnostics({ cause: classifyWorkerFailure(...), lastActivity: { item, agoMs } | null, stdoutTail, stderrTail })` for `GraphIndexWorkerError` instances; failures before the fork carry none
      (Req: Typed failure classification; Child output capture)
- [x] 9.12 Export the public worker types and values
      `packages/code-graph/src/public.ts` and `packages/code-graph/src/index.ts`
      Approach: export `GraphIndexWorkerError`, `IndexEvent`, `FileActivityEvent`, `FileSkippedEvent`, `ResourceDisposalFailedEvent`, `IndexEventReceiver`, `SizeSkippedFile`, `SizeExemptFile`, `GraphIndexTaskAnnouncer`, `GraphIndexWorkerEvent`, `GraphIndexFailureCause`, `GraphIndexWorkerDiagnostics`, `DEFAULT_MAX_FILE_BYTES`
      (Req: Typed event passthrough)
- [x] 9.13 Re-export from the SDK entry point
      `packages/sdk/src/index.ts`
      Approach: extend the existing `@specd/code-graph` re-export lists with the names from 9.12; do not duplicate definitions
      (Req: Typed event passthrough)

## 10. CLI

- [x] 10.1 Route events in the packaged task
      `packages/cli/src/graph-index-task.ts`: `CliGraphIndexProgress`, `runGraphIndexTask`
      Approach: `CliGraphIndexProgress = { percent, phase } | { event: IndexEvent }`; third parameter `announce`; `onEvent`: `file-activity` calls `announce(filePath, { mandatory: (sizeBytes ?? 0) >= 32768 })`, other events call `emitProgress({ event })`; keep `onProgress` emitting `{ percent, phase }`
      (Req: Worker diagnostics presentation)
- [x] 10.2 Distinguish progress shapes in the command
      `packages/cli/src/commands/graph/index-graph.ts`: `onProgress` handler
      Approach: `'event' in progress` routes to an event renderer that prints one stderr warning line for `resource-disposal-failed` in text mode and ignores other kinds; otherwise render `Indexing: N% phase` as today; register no handlers in `json`/`toon` mode
      (Req: Worker diagnostics presentation)
- [x] 10.3 Render the silence warning
      `index-graph.ts`: new `onEvent` passed to `runIsolatedGraphIndex` (text mode only)
      Approach: for `worker-silent` write to standard error `warning: no progress for Ns while processing <item>. If that file is not needed, add it to graph.excludePaths or lower graph.maxFileBytes.`; ignore `activity` and `stale-lock-recovered`
      (Req: Worker diagnostics presentation)
- [x] 10.4 Add the size formatting helper
      `packages/cli/src/commands/graph/index-graph.ts`: new `formatSize(bytes)`
      Approach: below 1024 `N B`; below 1 MiB `Math.round(bytes / 1024) KB`; otherwise MB with one decimal
      (Req: Size-skip summary and hint)
- [x] 10.5 Add the gitignore path escaping helper
      `packages/cli/src/commands/graph/index-graph.ts`: new `escapeGitignorePattern(path)`
      Approach: backslash-escape `\`, `*`, `?`, `[`, `]`; escape a leading `!` or `#`; escape leading and trailing spaces
      (Req: Size-skip summary and hint)
- [x] 10.6 Append the size-skip section to the text result
      `index-graph.ts`: `formatTextIndexResult`
      Approach: when `filesSkippedForSize > 0` print the count and the distinct applied limits, the ten largest from `largestSkippedForSize`, `... and N more` when `filesSkippedForSize` exceeds ten, the `graph.largeFilePaths` YAML snippet (project-relative, escaped), the `graph.maxFileBytes` hint (`0` disables) and the memory-cost line; when `sizeExemptAnalysed` is not empty print the separate list with sizes; print nothing extra otherwise so the previous output is unchanged
      (Req: Size-skip summary and hint)
- [x] 10.7 Render worker failures with diagnostics
      `index-graph.ts`: `catch` block
      Approach: when the error is a `GraphIndexWorkerError` with diagnostics, call `cliError(message, format, 3, 'CLI_ERROR', { detail, metadata })` where `detail` (text mode only) lists cause, last file and the stderr tail and `metadata` carries `cause`, `lastActivity`, `stdoutTail`, `stderrTail`; keep exit code 3
      (Req: Worker diagnostics presentation)
- [x] 10.8 Update the command help schema
      `index-graph.ts`: `addHelpText` JSON/TOON output schema
      Approach: list `filesSkippedForSize`, `largestSkippedForSize`, `sizeExemptAnalysed`
      (Req: Size-skip summary and hint)

## 11. Verification of the code groups

- [x] 11.1 Build and typecheck all packages
      repository root
      Approach: `pnpm build && pnpm typecheck`; fix every `IndexResult` literal and `IndexSession` implementer the compiler reports
      (Req: Index result)
- [x] 11.2 Re-run the blast radius check
      repository root
      Approach: `node packages/cli/dist/index.js graph index` then `graph impact --file ...` over the final changed files; record the risk in the review; confirm `code-graph:composition` does not enumerate `IndexResult` fields exhaustively (`specd specs show code-graph:composition`) and add a delta if it does
      (Req: Index result)

## 12. Tests

- [x] 12.1 Test the in-memory scope
      `packages/code-graph/test/application/use-cases/in-memory-parser-resource-scope.spec.ts`: new
      Approach: reverse disposal order, all disposals attempted when some throw, failures with indices, references dropped after a throw, reuse after close, re-entrant register during close, empty close no-op
      (Req: Parser resource lifecycle)
- [x] 12.2 Test the epoch-closing helper
      `packages/code-graph/test/application/services/close-parser-resource-epoch.spec.ts`: new
      Approach: stub `globalThis.gc`; requested after disposals; not requested for an empty scope; harmless when absent; failure callback called per failure
      (Req: Parser resource lifecycle)
- [x] 12.3 Test the size gate
      `packages/code-graph/test/application/services/file-size-gate.spec.ts`: new
      Approach: default boundary (262145 skipped, 262144 allowed), limit `0`, workspace override, byte (multibyte) measurement, stat failure, project and workspace exemptions with their bases, union, per-list negation, `../` project path, exempt only when over the limit
      (Req: Per-file size limit)
- [x] 12.4 Test the effective config resolution
      `packages/code-graph/test/application/use-cases/resolve-effective-graph-config.spec.ts`: new
      Approach: default, project, workspace override, `0`, root limit, exemption bases, config without `graph`
      (Req: Effective size limit resolution)
- [x] 12.5 Extend the fingerprint tests
      `packages/code-graph/test/application/use-cases/compute-graph-fingerprint.spec.ts`
      Approach: limit change, exemption change, equal effective values give equal fingerprints however declared, root fingerprint sensitivity
      (Req: Discovery fingerprint uses effective config)
- [x] 12.6 Extend the config builder tests
      `packages/code-graph/test/application/services/build-project-graph-config.spec.ts` and `bootstrap-graph-config.spec.ts`
      Approach: fields mapped and arrays copied with no default applied; bootstrap config has no `graph` block and resolves to 262144 through the effective config
      (Req: Effective size limit resolution)
- [x] 12.7 Test the visibility snapshot
      `packages/code-graph/test/application/services/graph-input-visibility.spec.ts`: new or extended
      Approach: oversized non-exempt files are not visible; exempt and within-limit files are
      (Req: Per-file size limit)
- [x] 12.8 Test the parser-resource lifecycle in the indexer
      `packages/code-graph/test/application/use-cases/index-code-graph.parser-resources.spec.ts`: new
      Approach: test adapter registering a counting resource and disposal; epoch closed after each file and for binary, unsupported and oversized files; parse failure closes and the run continues; throwing callback and persistence failure leave `size === 0`; disposal failures produce events and do not fail the run; fake-library adapter disposed without library names; max `scope.size` is 1 across chunks; no `napi-keepalive` state and no occurrence of the string in `src/infrastructure/tree-sitter/*.ts`
      (Req: Parser resource lifecycle; Bounded analysis memory)
- [x] 12.9 Test the size limit in the indexer
      `packages/code-graph/test/application/use-cases/index-code-graph.size-limit.spec.ts`: new
      Approach: default, exact boundary, `0`, workspace override, documents, test/ignored categories, project and workspace exemptions, exemption not bypassing `excludePaths` or the binary filter, coverage row `unsupported`/`file-too-large` and no persisted size, second incremental run without `deletedFiles`/refresh churn, no nodes for skipped files, no read or hash of oversized files, one stat per file, result fields (ordering, cap, exempt list, empty case)
      (Req: Per-file size limit; Index result)
- [x] 12.10 Extend the incremental tests
      `packages/code-graph/test/application/use-cases/index-code-graph-incremental.spec.ts`
      Approach: file grows past the limit and is removed (counted in `filesRemoved`); skipped file shrinks and is indexed; raising the limit triggers the fingerprint rebuild; import of a skipped module stays unresolved with the coverage reason and the result entry
      (Req: Size skip in incremental runs and dependents)
- [x] 12.11 Test the typed indexing events
      `packages/code-graph/test/application/use-cases/index-code-graph.events.spec.ts`: new
      Approach: one `file-activity` per file before the read, including skipped files and counted in progress; no throttle; `file-skipped` payload; throwing receiver ignored; with and without `onEvent` identical result and `onProgress` calls; events survive a JSON round trip
      (Req: Typed indexing events)
- [x] 12.12 Extend the IndexProjectGraph tests
      `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
      Approach: `onEvent` forwarded unchanged into `IndexOptions`
      (Req: Executes project indexing)
- [x] 12.13 Real-binding regression test
      `packages/code-graph/test/infrastructure/tree-sitter/parser-resource-lifecycle.integration.spec.ts`: new
      Approach: generate at least 200 small files per built-in language, run the real indexer, force a collection at every file boundary through a test helper (`v8.setFlagsFromString('--expose-gc')` plus `vm.runInNewContext('gc')`), assert no crash, `scope.size <= 1` at every registration, and symbols equal to a baseline analysis with a fresh session per file; fixtures generated, runs on all CI platforms
      (Req: Bounded analysis memory; Parser resource lifecycle)
- [x] 12.14 Extend the adapter conformance suite and the four adapter spec tests
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`, `typescript-language-adapter.spec.ts`, `python-language-adapter.spec.ts`, `go-language-adapter.spec.ts`, `php-language-adapter.spec.ts`
      Approach: each built-in adapter registers its parse result right after parsing and before the first traversal step (record the order through a wrapped scope), releases it when a fixture makes the traversal throw, holds no run-wide keepalive state, keeps nothing in instance fields or adapter state after the epoch closes (weak reference plus bounded retries around a forced collection), and returns a draft with no registered resource; add a fake-library adapter case
      (Req: Parser-owned resource registration)
- [x] 12.15 Extend the protocol tests
      `packages/code-graph/test/infrastructure/isolated-index-worker/protocol.spec.ts`
      Approach: `activity` accepted with exact keys; rejected with extra fields, empty or over-long item; v1 identifier rejected as a protocol failure
      (Req: Validated IPC lifecycle)
- [x] 12.16 Extend the supervisor tests
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`
      Approach: injected runtime and fake timers; activity events in order and not progress; stale-lock text plus typed event; fork options contain `--expose-gc` once with host arguments preserved and pipe stdio; output never reaches host streams; 16 KiB tail bound and invalid UTF-8 replacement; listeners and buffers released; `worker-silent` after 10 s, repeated at most every 10 s, reset by any message, never terminates, fires while the fake child never yields; throwing `onEvent` becomes `GraphIndexProgressHandlerError`; diagnostics attached with cause, last activity and tails; no diagnostics before the fork
      (Req: Activity and silence watchdog; Child output capture; Typed worker events; Child runtime options; Typed failure classification)
- [x] 12.17 Test the failure classifier
      `packages/code-graph/test/infrastructure/isolated-index-worker/classify-failure.spec.ts`: new
      Approach: table test covering each signal, exit codes `3221225477` and `134`, forwarded signal, out-of-memory stderr, unknown exit, and precedence
      (Req: Typed failure classification)
- [x] 12.18 Test the output tail
      `packages/code-graph/test/infrastructure/isolated-index-worker/output-tail.spec.ts`: new
      Approach: bound, order, multibyte boundary replacement, dispose
      (Req: Child output capture)
- [x] 12.19 Test the child announcer
      `packages/code-graph/test/infrastructure/isolated-index-worker/child.activity.spec.ts`: new
      Approach: at most four ordinary announcements per second, mandatory always sent and last, empty ignored, 4096 truncation, ignored after the terminal message
      (Req: Activity and silence watchdog)
- [x] 12.20 Extend the built-worker test
      `packages/code-graph/test/infrastructure/isolated-index-worker/dist.spec.ts`
      Approach: built worker uses the v2 identifier and a built forced index of a generated project exits 0; a test task module observes `typeof globalThis.gc === 'function'`
      (Req: Child runtime options; Validated IPC lifecycle)
- [x] 12.21 Extend the core loader and schema tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` and a schema spec beside the existing config schema tests
      Approach: fields exposed as declared at both levels, undeclared fields absent, negative/fractional/non-number rejected with a `ConfigValidationError` naming the key and location, `0` accepted, unknown key rejected, cascade (later scalar wins, arrays append)
      (Req: Graph file size limit; Graph size limit fields)
- [x] 12.22 Extend the SDK orchestration tests
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: `onEvent` forwarded; omission changes nothing; `onProgress` unchanged; result passthrough has the three fields; the new types are importable from `@specd/sdk`
      (Req: Typed event passthrough; Progress callback passthrough; Result passthrough)
- [x] 12.23 Extend the CLI task tests
      `packages/cli/test/graph-index-task.spec.ts`
      Approach: `file-activity` goes to `announce` with `mandatory` at 32768 bytes and above; other events go to `emitProgress({ event })`; progress shape unchanged; values are JSON-serializable
      (Req: Worker diagnostics presentation)
- [x] 12.24 Test the CLI command output
      `packages/cli/test/commands/graph/index-graph.spec.ts`: new or extended
      Approach: size-skip section content, cap of ten with `... and N more`, YAML snippet with escaping, hints and memory line, separate exempt list, previous output unchanged when nothing applies, structured modes with fields and no hint, `specd.yaml` untouched, silence warning on stderr only in text mode, failure rendering with cause, last file and stderr tail, exit code 3, `metadata` in structured output
      (Req: Size-skip summary and hint; Worker diagnostics presentation)
- [x] 12.25 Run the documentation coverage tests
      `packages/cli/test/configuration-coverage.spec.ts`, `documentation-coverage.spec.ts`
      Approach: they must pass after group 13; the first fails until `docs/guide/configuration.md` names both keys
      (Req: CLI reference documentation; Graph file size limit)

## 13. Documentation

- [x] 13.1 Configuration guide
      `docs/guide/configuration.md`: graph section and workspace graph block
      Approach: document `graph.maxFileBytes` and `graph.largeFilePaths` literally by name: type, bytes, default 262144 (256 KiB), `0` disables, workspace replaces the project value, pattern syntax and base directories, additive workspace lists, exemption only from the size limit, applies to documents as well as code
      (Req: Graph file size limit; Project-level graph configuration; Workspace-level graph configuration)
- [x] 13.2 Configuration examples
      `docs/guide/configuration-examples.md`
      Approach: add an example using both fields at project and workspace level
      (Req: Graph file size limit)
- [x] 13.3 Workspaces guide
      `docs/guide/workspaces.md`
      Approach: per-workspace `maxFileBytes` override and the code-root base of workspace `largeFilePaths`
      (Req: Graph file size limit)
- [x] 13.4 Code graph guide
      `docs/guide/code-graph.md`
      Approach: explain size-skipped files, why the limit exists (memory per source byte), how they are reported and how to index a specific large file anyway
      (Req: Size-skip summary and hint)
- [x] 13.5 CLI documentation for `graph index`
      `docs/cli/graph.md` and `docs/cli/cli-reference.md` (`graph` section)
      Approach: new JSON/TOON fields, the text summary and hint format, the worker silence warning, failure causes and diagnostics, unchanged exit codes, and an example indexing a large file through `largeFilePaths`
      (Req: CLI reference documentation; Size-skip summary and hint; Worker diagnostics presentation)
- [x] 13.6 SDK documentation
      `docs/sdk/` pages for `runIndexProjectGraph` and `runIsolatedGraphIndex` (start from `docs/sdk/index.md`)
      Approach: document `onEvent`, the three event kinds and their fields, the new result fields, `GraphIndexWorkerEvent`, `GraphIndexFailureCause` and `GraphIndexWorkerDiagnostics`
      (Req: Typed event passthrough)
- [x] 13.7 Code graph internals documentation
      `docs/code-graph/index.md` and `docs/code-graph/use-cases.md`
      Approach: describe the size gate in the indexing flow and the per-file parser-resource epoch with the yield-after-close rule
      (Req: Per-file size limit; Parser resource lifecycle)
- [x] 13.8 Language adapter guide
      `docs/code-graph/language-adapters.md`
      Approach: add the adapter obligation (register parser-owned resources with an optional disposal function in `session.parserResources`, keep nothing else, return plain data); state the same rules as the spec's "Parser-owned resource registration" and keep it consistent with "Adding a language adapter"
      (Req: Parser-owned resource registration)
- [x] 13.9 Core ports documentation
      `docs/core/ports.md`
      Approach: update the description of the graph configuration shape with the two new fields
      (Req: Graph file size limit)
- [x] 13.10 Public JSDoc review
      all new exported symbols in `packages/code-graph/src`, `packages/core/src/application/specd-config.ts`, `packages/sdk/src`
      Approach: confirm every exported type, field and function has complete JSDoc (the generated API reference regenerates from it); do not edit `apps/public-web/.generated/**` or `packages/guide/generated/*.json`
      (Req: Typed event passthrough; Graph file size limit)

## 14. Changeset and final checks

- [x] 14.1 Add the changeset
      `.changeset/<yyyymmdd>-bound-indexer-ast-resource-lifecycle.md`: new
      Approach: follow the format of the existing files in `.changeset/`; `@specd/core`, `@specd/code-graph`, `@specd/sdk`, `@specd/cli` and `@specd/specd` as `minor`; summary notes that files above 256 KB are no longer indexed by default and how to restore the previous behaviour; list the twelve affected spec ids
      (Req: Per-file size limit)
- [x] 14.2 Run lint, format and the full test suite
      repository root
      Approach: `pnpm lint`, the repository formatter, and `pnpm test`; all green on the current platform; CI covers the other platforms
      (Req: Bounded analysis memory)
- [x] 14.3 Perform the manual verification steps from the design
      repository root and a generated project
      Approach: run steps 1 to 9 of the design's "Manual verification" and record the outcomes in the implementation notes
      (Req: Size-skip summary and hint; Worker diagnostics presentation; Per-file size limit)

## 15. Follow-up from the verification audit

These tasks were added after the compliance audit of the first implementation (groups 1 to 14 are unchanged and remain as completed history).

- [x] 15.1 Add the completeness types to the health result
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `GetGraphHealthResult`, coverage assessment near the `complete` computation (~line 270)
      Approach: add `CoverageCompleteness` and `CoverageWarning` exactly as in design "Post-verification corrections" item 2; derive `incomplete` / `unknown` from the existing rules, otherwise count `unsupported` facts with reason `file-too-large` into `complete-with-warnings` or `complete`; leave `coverageComplete` untouched; full JSDoc
      (Req: Coverage completeness with warnings)
- [x] 15.2 Forward the completeness fields through the SDK and CLI types
      `packages/sdk/src/orchestration/build-project-status-snapshot.ts`, `packages/sdk/src/index.ts`, `packages/code-graph/src/index.ts` and `public.ts`
      Approach: export `CoverageCompleteness` and `CoverageWarning`; pass the two fields through any health projection without recomputation
      (Req: Coverage completeness with warnings)
- [x] 15.3 Render the completeness in `graph stats`
      `packages/cli/src/commands/graph/stats.ts`: text formatter
      Approach: for `complete-with-warnings` print `coverage: complete with warnings (N file(s) skipped: file-too-large)` and the hint about `graph.maxFileBytes` / `graph.largeFilePaths`; print nothing extra for `complete`; keep `incomplete` / `unknown` diagnostics; structured modes unchanged
      (Req: Coverage completeness presentation)
- [x] 15.4 Anchor and quote the snippet entries
      `packages/cli/src/commands/graph/index-graph.ts`: `escapeGitignorePattern` and the snippet builder in `formatTextIndexResult`
      Approach: prefix `/` when the path has no slash; single-quote YAML scalars that contain ` #`, `: `, start with `-` or a YAML indicator (double the single quote); update the escape tests
      (Req: Size-skip summary and hint)
- [x] 15.5 Classify worker failures after `close`
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`: `onExit`, `settle`, `attach`
      Approach: record exit code and signal on `exit`; build diagnostics and settle on `close`, with a 1000 ms safety timer after `exit` (injectable through `runtime.timers`); keep every typed outcome unchanged
      (Req: Typed failure classification; Child output capture)
- [x] 15.6 Harden the watchdog
      `supervisor.ts`: silence interval
      Approach: `unref` the handle when available, clear it when a terminal message is recorded, never overwrite an existing `terminal` from the timer, and word the error "event handler"
      (Req: Activity and silence watchdog)
- [x] 15.7 Refine the classifier
      `packages/code-graph/src/infrastructure/isolated-index-worker/classify-failure.ts`
      Approach: add exit code `3221226505` to the native-crash codes; anchor the resource-limit pattern to V8 fatal-error report lines
      (Req: Typed failure classification)
- [x] 15.8 Fix `filesRemoved` accuracy and the tie-break
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: deletion detection and result assembly
      Approach: for a size-skipped path use `indexedResourceKinds.has(path)` instead of `existingArtifactHashes.has(path)`; replace `localeCompare` in the two result sorts with plain code-unit comparison; log disposal failures of the run-level `finally` at debug level
      (Req: Size skip in incremental runs and dependents; Index result)
- [x] 15.9 Correct the documentation
      `docs/cli/graph.md`, `docs/cli/cli-reference.md`, `docs/sdk/index.md`, `docs/code-graph/use-cases.md`, `docs/cli/graph.md` (stats section)
      Approach: apply design "Post-verification corrections" item 14 (real cause names, array-of-object types, real warning text, `coverageCompleteness` and `coverageWarnings`)
      (Req: CLI reference documentation; Coverage completeness presentation)
- [x] 15.10 Document public event and diagnostics members
      `packages/code-graph/src/domain/value-objects/index-event.ts`, `graph-index-worker-types.ts`
      Approach: member-level JSDoc on every field of every exported event, diagnostics and worker-event type
      (Req: Typed event passthrough)
- [x] 15.11 Update the changesets
      `.changeset/20261026-bound-indexer-ast-resource-lifecycle.md` and `-specd.md`
      Approach: mention the one-time rebuild after upgrading, the new health fields, and add `code-graph:get-graph-health` and `cli:graph-stats` to the affected specs
      (Req: Per-file size limit)
- [x] 15.12 Add the indexer tests
      `packages/code-graph/test/application/use-cases/index-code-graph.parser-resources.spec.ts`, `index-code-graph.events.spec.ts`, `index-code-graph.size-limit.spec.ts`, `index-code-graph-incremental.spec.ts`
      Approach: design item 15 (a) to (d); assert an oversized file yields `file-skipped` and no `file-activity`
      (Req: Parser resource lifecycle; Typed indexing events; Size skip in incremental runs and dependents)
- [x] 15.13 Add the worker tests
      `packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts`
      Approach: design item 15 (e) to (g); replace the two tests that send v1 messages by tests that exercise a real duplicate terminal and a version mismatch
      (Req: Validated IPC lifecycle; Typed failure classification; Child output capture; Activity and silence watchdog)
- [x] 15.14 Add the CLI tests
      `packages/cli/test/commands/graph-index.spec.ts`, `packages/cli/test/commands/graph/escape-gitignore-pattern.spec.ts`, and a `graph stats` spec
      Approach: design item 15 (h) to (i) and (k)
      (Req: Size-skip summary and hint; Worker diagnostics presentation; Coverage completeness presentation)
- [x] 15.15 Add the adapter and health tests
      `packages/code-graph/test/infrastructure/tree-sitter/language-adapter-conformance.spec.ts`, `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
      Approach: design item 15 (j) and (k): `structuredClone` of the draft contains no `SgNode`; the four completeness values and the warning counts
      (Req: Parser-owned resource registration; Coverage completeness with warnings)
- [x] 15.16 Run the full checks again
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, then each package suite on its own (`core`, `code-graph`, `sdk`, `guide`, `cli`) and finally `pnpm test`
      (Req: Bounded analysis memory)

## 16. Verification round 2

- [x] 16.1 Remove the plain-complete label next to the warning in `graph stats`
      `packages/cli/src/commands/graph/stats.ts`
      Approach: design item 16; print the boolean line only when there are no coverage warnings, and show every warning code with its own count
      (Req: Coverage completeness presentation)
- [x] 16.2 Add the stats and exemption tests
      `packages/cli/test/commands/graph-stats.spec.ts`, `packages/code-graph/test/application/use-cases/index-code-graph.size-limit.spec.ts`
      Approach: design item 16; no plain-complete label with warnings, `incomplete` and `unknown` rendering, and a project plus workspace `largeFilePaths` exemption in one workspace
      (Req: Coverage completeness presentation; Per-file size limit and exemptions)
- [x] 16.3 Run the checks again
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, then each package suite on its own
      (Req: Bounded analysis memory)

## 17. Verification round 3

- [x] 17.1 Map receiver failures during lock acquisition
      `packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`
      Approach: design item 17; wrap the `stale-lock-recovered` event and the warning receiver so a throw becomes `GraphIndexProgressHandlerError` and the lock lease is released
      (Req: Typed worker events; Silence watchdog)
- [x] 17.2 Document the event variants member by member
      `packages/code-graph/src/domain/value-objects/graph-index-worker-types.ts`
      Approach: design item 17; TSDoc for the fields of `activity`, `worker-silent`, `lastActivity.item` and `agoMs`
      (Req: Public event types)
- [x] 17.3 Fix the CLI details
      `packages/cli/src/commands/graph/index-graph.ts`, `packages/cli/src/commands/graph/stats.ts`, `docs/cli/cli-reference.md`
      Approach: design item 17; `formatSize`, the single `cliError` path, `allowedPaths` in the docs list, and the empty-warning guard in `graph stats`
      (Req: Size-skip summary and hint; Coverage completeness presentation)
- [x] 17.4 Add the worker and SDK tests
      `packages/code-graph/test/infrastructure/isolated-index-worker/`, `packages/sdk/test/`
      Approach: design item 17; throwing receivers on the silence tick and on lock recovery, a real silent child, invalid UTF-8 and 1 MiB output, worker events absent from the SDK receiver, and the exported event types
      (Req: Typed worker events; Silence watchdog; Worker diagnostics)
- [x] 17.5 Add the indexer, config and CLI tests
      `packages/code-graph/test/application/use-cases/`, `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `packages/cli/test/commands/graph-stats.spec.ts`
      Approach: design item 17; retention across several chunks, the `maxFileBytes` rejection message, a TOON `graph stats` test
      (Req: Parser-resource scope; Configuration validation; Coverage completeness presentation)
- [x] 17.6 Cover the SDK recovery rule
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: design item 17; non-forced `SCHEMA_INCOMPATIBLE` recovery, a non-schema recoverable failure propagating, and derivation-mismatch recreation
      (Req: runIndexProjectGraph orchestration)
- [x] 17.7 Run the checks again
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, then each package suite on its own
      (Req: Bounded analysis memory)

## 18. Size skips and freshness

- [x] 18.1 Ignore size-skipped coverage rows in the membership comparison
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`
      Approach: design item 18; drop the coverage facts with status `unsupported` and reason `file-too-large` when building the indexed locators
      (Req: Efficient scope assessment)
- [x] 18.2 Test index followed by health with a size skip
      `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
      Approach: design item 18; a fresh index with a skipped file gives no `FILESET_CHANGED`, a file that grows past the limit does
      (Req: Efficient scope assessment)
- [x] 18.3 Run the checks again
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, then each package suite on its own, and the scratch project with an oversized file
      (Req: Bounded analysis memory)

## 19. Diagnostics versus failures

- [x] 19.1 Add `diagnostics` to the index result and route the resolution messages to it
      `packages/code-graph/src/domain/value-objects/index-result.ts`, `packages/code-graph/src/application/use-cases/index-code-graph.ts`, `packages/code-graph/src/application/use-cases/index-project-graph.ts`
      Approach: design item 19 (c); the six push sites for `<manifest>`, `<packageResolution>` and `<reExportLinking>` go to `diagnostics`
      (Req: Index result)
- [x] 19.2 Gate observation capture and latches by the commit, and retry failed targets
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`
      Approach: design item 19 (a) and (b); remove the `errors.length === 0` gates on the observations and on `clearGraphStaleLatch`; treat a `parse-failed` coverage record and an errored target without observation as new in the diff, even when the hash is equal
      (Req: Indexed-input observation capture; Retry of failed targets)
- [x] 19.3 Pass the field through the SDK and present it in the CLI
      `packages/sdk/src/orchestration/run-index-project-graph.ts`, `packages/cli/src/commands/graph/index-graph.ts`, `packages/cli/src/graph-index-task.ts`, `docs/cli/graph.md`, `docs/sdk/index.md`
      Approach: design item 19; text mode prints the warnings under a count heading and keeps the exit code
      (Req: Result passthrough; Resolution diagnostics presentation)
- [x] 19.4 Test the indexer behaviour
      `packages/code-graph/test/application/use-cases/`
      Approach: design item 19; a collision clears the latches and fills `diagnostics`; a failing file is in `errors` and `parse-failed`, has no observation and does not keep the latches; a non-forced run retries it, replaces the failure when it succeeds, and a store failure keeps the latches
      (Req: Indexed-input observation capture; Retry of failed targets)
- [x] 19.5 Update the existing fixtures and tests for the new field
      `packages/*/test`
      Approach: design item 19; add `diagnostics: []` where a result is built, and move the assertions that expected collisions in `errors`
      (Req: Index result)
- [x] 19.6 Add the CLI and SDK tests
      `packages/cli/test/commands/graph-index.spec.ts`, `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: design item 19; warnings in text mode with exit code 0 and `diagnostics` in JSON; passthrough
      (Req: Resolution diagnostics presentation; Result passthrough)
- [x] 19.7 Run the checks and repeat the real case
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, each package suite on its own, then `graph index` and `graph stats` in the repository with the collisions
      (Req: Bounded analysis memory)

## 20. Audit findings of round 6

- [x] 20.1 Fix the failure identity, the hashing-failure branch and the forced-run hashes
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`
      Approach: design item 20 (b); the spec error carries the spec identifier, the hash or stat failure marks `parse-failed` with a single `errors` entry, and the hash map is filled on forced and fingerprint-mismatch runs
      (Req: Indexed-input observation capture)
- [x] 20.2 Align the SDK documentation and add the small items
      `docs/sdk/index.md`, `packages/code-graph/src/domain/value-objects/graph-index-worker-types.ts`
      Approach: design item 20 (a) and (c); the repair paragraph states the non-forced `SCHEMA_INCOMPATIBLE` recovery, and `kind` of the stale-lock event gets its TSDoc
      (Req: Repair lifecycle passthrough)
- [x] 20.3 Test the indexer cases
      `packages/code-graph/test/application/use-cases/index-code-graph.failed-targets.spec.ts`
      Approach: design item 20; failing spec, pass-2 failure, forced run with a failing file, forced run observations, hashing failure, and a run that does not commit keeps the latches
      (Req: Indexed-input observation capture)
- [x] 20.4 Test the SDK passthrough
      `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
      Approach: design item 20 (c); `diagnostics` appears unchanged in the result
      (Req: Result passthrough)
- [x] 20.5 Run the checks again
      repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, each package suite on its own, and `graph index` plus `graph stats` in the repository with the manifest collisions
      (Req: Bounded analysis memory)
