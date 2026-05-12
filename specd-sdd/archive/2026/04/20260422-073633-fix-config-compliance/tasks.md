# Tasks: fix-config-compliance

## 1. Config loader schema and parsing

- [x] 1.1 Remove `artifactRules` from config schema
      `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdYamlZodSchema` — remove top-level `artifactRules` acceptance so startup rejects stale field
      Approach: delete the `artifactRules` key from the Zod object and keep strict validation behavior for unknown keys
      (Req: core/config Startup validation, core/config-loader YAML parsing and structural validation)
- [x] 1.2 Add `plugins` schema validation
      `packages/core/src/infrastructure/fs/config-loader.ts`: `SpecdYamlZodSchema` — validate `plugins.agents[]` entries with required `name` and optional `config`
      Approach: introduce a dedicated raw plugins Zod shape and wire it as optional field in the root config schema
      (Req: core/config Plugin declarations)
- [x] 1.3 Stop extracting `artifactRules` into runtime config
      `packages/core/src/infrastructure/fs/config-loader.ts`: config mapping logic — remove any `raw.artifactRules` projection into returned config
      Approach: update the parsed object assembly so the output type and runtime shape no longer include legacy field
      (Req: core/config Startup validation, core/composition SpecdConfig shape)
- [x] 1.4 Emit specific workspace `contextMode` error
      `packages/core/src/infrastructure/fs/config-loader.ts`: `WorkspaceRawZodSchema` — reject workspace-local `contextMode` with spec-specific message
      Approach: add targeted refinement/custom issue for `contextMode` inside workspace entries instead of relying only on generic strict-object error
      (Req: core/config Startup validation scenario: contextMode in workspace entry rejected)

## 2. Runtime config contracts

- [x] 2.1 Remove legacy `artifactRules` from `SpecdConfig`
      `packages/core/src/application/specd-config.ts`: `SpecdConfig` — remove obsolete optional `artifactRules` property
      Approach: tighten interface and let TypeScript surface remaining references in adapters/tests
      (Req: core/composition SpecdConfig plain typed object, core/config Startup validation)
- [x] 2.2 Add validated `plugins` to `SpecdConfig`
      `packages/core/src/application/specd-config.ts`: `SpecdConfig` — add optional typed `plugins` field
      Approach: model `plugins.agents` with readonly structures aligned with loader output and CLI consumption
      (Req: core/config Plugin declarations)
- [x] 2.3 Align `ConfigWriter.addPlugin` port signature
      `packages/core/src/application/ports/config-writer.ts`: `ConfigWriter` interface — include optional `config` parameter
      Approach: update interface signature to match existing infrastructure implementation without changing behavior
      (Req: core/config-writer-port AddPlugin, core/config Config writer port)

## 3. Template expansion warning path

- [x] 3.1 Introduce unknown-variable callback type
      `packages/core/src/domain/services/template-expander.ts`: `OnUnknownVariable` — define callback contract for unresolved template tokens
      Approach: add exported function type near existing template-variable types without introducing I/O in domain
      (Req: core/template-variables Expansion semantics, default/\_global/architecture Domain layer is pure)
- [x] 3.2 Extend `TemplateExpander` with optional warning callback
      `packages/core/src/domain/services/template-expander.ts`: `TemplateExpander` constructor and replacement flow — invoke callback when token cannot resolve
      Approach: add optional constructor arg, store private field, and call callback only on unresolved tokens while preserving current token output
      (Req: core/template-variables TemplateExpander class, core/config Template variables unknown variable warning)
- [x] 3.3 Wire callback from composition layer
      `packages/core/src/composition/kernel-internals.ts`: `createKernelInternals` — pass callback when constructing `TemplateExpander`
      Approach: inject callback at composition boundary so warning behavior is configured outside domain logic
      (Req: default/\_global/architecture Composition layer for use-case wiring, core/template-variables Variable map construction)

## 4. CLI output alignment

- [x] 4.1 Remove `artifactRules` from `config show` text output
      `packages/cli/src/commands/config/show.ts`: `renderText` — remove legacy section from summarized text output
      Approach: delete conditional block tied to removed `SpecdConfig.artifactRules`
      (Req: cli/config-show Output format, core/config Startup validation)
- [x] 4.2 Add `plugins` section in `config show` text output
      `packages/cli/src/commands/config/show.ts`: `renderText` — render configured plugin agent names when present
      Approach: add optional plugins output block without changing JSON mode serialization path
      (Req: cli/config-show Output format, core/config Plugin declarations)

## 5. Core tests

- [x] 5.1 Add config-loader tests for compliance gaps
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: new scenarios — cover local config standalone validation, workspace contextMode message, schemaPlugins/schemaOverrides parsing, approvals parsing, llmOptimizedContext parsing
      Approach: add focused cases mapped to R2/R5/R10/R11/R15/R16 and assert typed `ConfigValidationError` behavior
      (Req: core/config-loader verify scenarios, core/config Startup validation)
- [x] 5.2 Add template-expander unknown-variable callback test
      `packages/core/test/domain/services/template-expander.spec.ts`: unresolved token scenario — assert callback invocation and token preservation
      Approach: construct expander with spy callback, expand unresolved token, assert callback args and output string unchanged
      (Req: core/template-variables verify Unknown namespace preserved + warning behavior extension)
- [x] 5.3 Audit TemplateExpander helper construction in use-case tests
      `packages/core/test/application/use-cases/helpers.ts`: helper constructors — ensure optional callback signature changes do not break helper setup
      Approach: review all `new TemplateExpander(...)` call sites and adjust only where explicit callback behavior is required
      (Req: default/\_global/testing Port mocks are typed, core/template-variables TemplateExpander class)

## 6. CLI tests

- [x] 6.1 Update config-show expectations for removed field
      `packages/cli/test/commands/config-show.spec.ts`: text-mode assertions — remove `artifactRules` expectations
      Approach: update fixture expectations to match new text rendering contract
      (Req: cli/config-show verify Text output shows all sections)
- [x] 6.2 Add config-show plugins display test
      `packages/cli/test/commands/config-show.spec.ts`: text-mode scenario — assert plugins section appears with agent names
      Approach: provide config fixture with `plugins.agents` and verify rendered lines in text output
      (Req: core/config Plugin declarations, cli/config-show Output format)

## 7. Documentation updates

- [x] 7.1 Remove legacy field docs from config reference
      `docs/config/config-reference.md`: remove `artifactRules` and outdated skills manifest references
      Approach: delete obsolete sections and keep docs aligned with `schemaOverrides` and plugins-based model
      (Req: default/\_global/docs CLI/Core documentation alignment)
- [x] 7.2 Remove legacy field docs from configuration guide
      `docs/guide/configuration.md`: remove `artifactRules` guidance
      Approach: update narrative and examples to avoid stale configuration keys
      (Req: default/\_global/docs Directory structure and doc consistency)
- [x] 7.3 Clean config example docs
      `docs/config/examples/approvals-and-workflow-hooks.md`: remove `artifactRules` usage from YAML examples
      Approach: keep examples runnable with current loader schema and spec expectations
      (Req: default/\_global/docs, core/config Examples consistency)
- [x] 7.4 Verify ADR wording does not present `artifactRules` as active
      `docs/adr/0010-schema-format.md`: sanity check wording around overlap/migration note
      Approach: adjust phrasing only if it implies active support rather than historical context
      (Req: default/\_global/docs ADR format and consistency)

## 8. End-to-end verification

- [x] 8.1 Run targeted manual checks
      `specd` CLI execution paths: `config show` text/json and invalid config inputs — verify no `artifactRules`, plugins shown, and specific workspace `contextMode` error
      Approach: run command matrix using fixture configs and compare outputs/errors against updated verify scenarios
      (Req: core/config verify + cli/config-show verify)
- [x] 8.2 Run repository quality gates
      Monorepo test/lint commands: ensure no regressions after contract updates
      Approach: execute `pnpm test` and `pnpm lint`, then resolve failures in touched areas before implementation handoff
      (Req: default/\_global/testing, default/\_global/eslint)
