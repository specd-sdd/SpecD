# Attempt 11 - scoped audit of tasks section 22 (read-only)

Touched specs run: core kernel-builder.spec.ts, cli cli-cleanup.spec.ts, cli cli-context-real-host.spec.ts, sdk barrel.spec.ts -> 46 passed, 0 failed.

1. sdk:host-context (spec + verify) vs additionalDestinations: CONFORMS.
   Spec step 1 requires builder to preserve every KernelOptions field incl. additionalDestinations; verify scenario (spec-preview line ~146) covers callback destination.
   Code: kernel-builder.ts adds field to KernelBuilderState, cloneOptions (copy) and toKernelOptions (only when non-empty). Core test kernel-builder.spec.ts:206 and CLI real-host test (onLog delivered through real kernel logger) cover it.
   Coverage note (not a defect): toKernelOptions omits an empty array; equivalent to absent, so harmless.
   Unrelated incidental edit in the same diff: JSDoc of registerCheck pluginName updated to the scoped grammar; consistent with plugin-manager spec.

2. sdk:composition barrel: CONFORMS.
   Spec line 42 lists ConfigWriter, AddPluginOptions, ConfigDeclaredPlugin, LegacyConfigFormatError, UnsupportedConfigVersionError (+ createConfigWriter, isPluginName, PLUGIN_NAME_REGEX).
   packages/sdk/src/core-reexports.ts:4-5 and :529-530 export all. barrel.spec.ts:62-73 asserts the types (toEqualTypeOf core, not any) and the error classes as functions.

3. cli-cleanup.ts describeFailure: CONFORMS.
   Empty AggregateError now falls through to its own message; non-empty ones are flattened recursively. Tests cli-cleanup.spec.ts:61 (flat), :73 (empty), :84 (nested, exact line list). cli:host-context spec line 44 says "AggregateError is flattened into one line per cause", warning format and no exit-code change; no contradiction. Empty-aggregate and recursive nesting are not stated in the spec (spec silent, not contradicted).
   minor (spec gap, optional): the spec could state that an AggregateError without causes reports its own message and nesting is flattened recursively; no verify scenario exists for either (tests only).

4. New tests: CONFORMS, with one weak spot.
   - core test (kernel-builder.spec.ts:206-224) now disposes in finally and genuinely asserts the callback receives the logger entry. Other builder tests dispose their kernels.
   - CLI real-host test 'disposes a real kernel twice' (cli-context-real-host.spec.ts ~L33-43) calls kernel.dispose() twice on a real kernel and asserts second resolves to undefined; matches the "repeated calls share one disposal" semantics. Weak spot: it only proves no throw/resolve; it does not assert disposers ran exactly once (the host-context verify scenario "each disposer ran exactly once" is covered elsewhere with mocks, not on the real host). Also the afterwards runCliCleanup() is a third dispose, which is fine.
     minor (coverage gap): real double-dispose test does not observe that plugin/graph disposers ran once.

Totals: majors 0, minors 2 (spec silent on empty/nested AggregateError; real double-dispose test does not assert single execution of disposers).
