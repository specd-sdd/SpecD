# Tasks: delta-visibility

## 1. New dependency

- [x] 1.1 Add `diff` package to `@specd/core`
      `packages/core/package.json`: add `"diff": "^7.0.0"` to `dependencies`
      Run `pnpm install` to update lockfile
      (Req: Diff generation)

## 2. PreviewSpec use case

- [x] 2.1 Create `SpecNotInChangeError`
      `packages/core/src/application/errors/spec-not-in-change-error.ts`: new error class
      Approach: extend `Error`, constructor takes `specId` and `changeName`, message: `Spec '<specId>' is not in change '<changeName>'`
      (Req: Spec ID validation)

- [x] 2.2 Implement `PreviewSpec` use case
      `packages/core/src/application/use-cases/preview-spec.ts`: new class with `execute(input)` method
      Approach: load change → schema guard → validate specId in change.specIds → iterate schema.artifacts() for scope:spec → discover files from change.artifact(type).getFile(specId) → for delta files: parseDelta → skip no-ops → load base from SpecRepository → parse/apply/serialize → for new spec files: load content, base=null → sort (spec.md first, rest alphabetical) → generate diff via createTwoFilesPatch when input.diff=true → wrap each file in try/catch, add warning on failure
      (Req: File discovery, Delta application, Artifact file ordering, Result shape, Diff generation, Error handling, Schema name guard)

- [x] 2.3 Create `PreviewSpec` composition function
      `packages/core/src/composition/use-cases/preview-spec.ts`: `createPreviewSpec(config)` factory
      Approach: follow `createCompileContext` pattern — build ChangeRepository, SpecRepository map, SchemaProvider, ArtifactParserRegistry from config, return `new PreviewSpec(...)`
      (Req: Ports and constructor)

- [x] 2.4 Export from `@specd/core` public API
      `packages/core/src/index.ts`: export `PreviewSpec`, `PreviewSpecInput`, `PreviewSpecResult`, `PreviewSpecFileEntry`, `SpecNotInChangeError`

## 3. CompileContext integration

- [x] 3.1 Add `PreviewSpec` parameter to `CompileContext` constructor
      `packages/core/src/application/use-cases/compile-context.ts`: add `previewSpec: PreviewSpec` as last constructor param, store as `this._previewSpec`
      (Req: Ports and constructor — PreviewSpec)

- [x] 3.2 Implement materialized delta view in content rendering
      `packages/core/src/application/use-cases/compile-context.ts`: in the full-mode rendering loop (around line 440-487), for specs in `change.specIds`:
      Approach: call `this._previewSpec.execute({ name: input.name, specId, diff: false })` — if result.files is non-empty, use merged content from the spec.md entry (or first file) as ContextSpecEntry.content — on empty result or error, fall back to existing metadata/extraction logic — add preview warnings to context warnings
      (Req: Materialized delta view)

- [x] 3.3 Update `createCompileContext` composition
      `packages/core/src/composition/use-cases/compile-context.ts`: create `PreviewSpec` instance and pass to `CompileContext` constructor
      Approach: instantiate `new PreviewSpec(changeRepo, opts.specRepositories, schemaProvider, parsers)` before constructing `CompileContext`, pass as last arg

- [x] 3.4 Update `createKernel` to wire `PreviewSpec`
      `packages/core/src/composition/kernel.ts`:
      Approach: create `const previewSpec = new PreviewSpec(i.changes, i.specs, schemaProvider, i.parsers)` — pass to `CompileContext` constructor (line 210) — add `preview: previewSpec` to `changes` section — add `preview: PreviewSpec` to `Kernel` interface

## 4. CLI command

- [x] 4.1 Implement `spec-preview` command
      `packages/cli/src/commands/change/spec-preview.ts`: new `registerChangeSpecPreview(parent)` function
      Approach: `.command('spec-preview <name> <specId>')` with `--diff` and `--format` options — resolve CLI context → call `kernel.changes.preview.execute()` — text mode merged: concatenate files with `--- filename ---` separators — text mode diff: colorize lines with chalk (green +, red -, cyan @@, dim context) — json/toon: output PreviewSpecResult directly — warnings to stderr — errors via handleError
      (Req: Command signature, Text output, JSON/TOON output, Error handling)

- [x] 4.2 Register command in CLI entry point
      `packages/cli/src/index.ts`: import `registerChangeSpecPreview` from `./commands/change/spec-preview.js`, call `registerChangeSpecPreview(changeCmd)`

## 5. Tests

- [x] 5.1 Unit tests for `PreviewSpec`
      `packages/core/test/application/use-cases/preview-spec.spec.ts`: new test file
      Approach: mock ChangeRepository, SpecRepository, SchemaProvider, ArtifactParserRegistry — test delta merge (parse→apply→serialize chain), no-op skip, new spec (base=null), file ordering (spec.md first), diff generation, error handling (parser throws → warning), specId validation (throws), schema mismatch (throws), partial failure (valid file returned, bad file skipped)

- [x] 5.2 Unit tests for `CompileContext` materialized view
      `packages/core/test/application/use-cases/compile-context.spec.ts`: add test cases
      Approach: update existing test helper to pass mock PreviewSpec to constructor — test: preview result used as content, empty preview falls back to metadata, preview error falls back with warning, summary-mode specs not previewed, non-specIds specs not previewed

- [x] 5.3 Integration tests for CLI `spec-preview`
      `packages/cli/test/commands/change/spec-preview.spec.ts`: new test file
      Approach: test command invocation via CLI test harness — verify text output format (separators, ordering), diff output, json format, error exit codes (missing change, spec not in change), warnings on stderr

## 6. Build and verify

- [x] 6.1 Build all packages
      Run `pnpm build` — verify no TypeScript errors

- [x] 6.2 Run full test suite
      Run `pnpm test` — verify all existing + new tests pass

- [x] 6.3 Run linter
      Run `pnpm lint` — verify no lint errors
