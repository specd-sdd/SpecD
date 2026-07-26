# Tasks: context-catalogue-load-hints

## 1. SDK presentation helpers

- [x] 1.1 Add shared catalogue rendering helpers
      `packages/sdk/src/presentation/_shared/catalogue.ts`: table + hint builders
      Approach: partition change catalogue (`mode !== 'full'`) into `specIds` / other (`specDependsOn`|`includePattern`) / `dependsOnTraversal`; emit `spec-preview` prose only for the `specIds` group; emit one shared `specs context` prose for other+traversal; Via dependencies sub-heading for traversal; project catalogue only `specs context`; columns per design
      (Req: Change catalogue grouping and load hints; projectContextToMarkdown)

- [x] 1.2 Implement `changeContextToMarkdown`
      `packages/sdk/src/presentation/change-context-to-markdown.ts`: `changeContextToMarkdown`, `ChangeContextToMarkdownOptions`
      Approach: consume existing `CompileContextResult`; `status: 'unchanged'` → fingerprint + exact `Context unchanged since last call.`; otherwise fingerprint, project entries, full specs, catalogue via shared helpers
      (Req: changeContextToMarkdown)

- [x] 1.3 Implement `projectContextToMarkdown`
      `packages/sdk/src/presentation/project-context-to-markdown.ts`: `projectContextToMarkdown`
      Approach: consume existing `GetProjectContextResult`; render `contextEntries`, full specs, catalogue with `specs context` hint; empty → `no project context configured`; never mention `spec-preview`
      (Req: projectContextToMarkdown)

- [x] 1.4 Export presentation barrel from SDK
      `packages/sdk/src/presentation/index.ts` + `packages/sdk/src/index.ts`
      Approach: export `changeContextToMarkdown`, `projectContextToMarkdown`, `ChangeContextToMarkdownOptions` from public barrel
      (Req: Module location; sdk:composition Public barrel exports)

## 2. SDK tests

- [x] 2.1 Unit tests for `changeContextToMarkdown`
      `packages/sdk/test/presentation/change-context-to-markdown.spec.ts`
      Approach: unchanged exact message; fingerprint+full; `specIds`→preview group; canonical→`specs context`; Via dependencies; no preview prose when `specIds` catalogue empty
      (Req: changeContextToMarkdown; Change catalogue grouping and load hints)

- [x] 2.2 Unit tests for `projectContextToMarkdown`
      `packages/sdk/test/presentation/project-context-to-markdown.spec.ts`
      Approach: empty message; catalogue `specs context` hint; assert no `spec-preview`
      (Req: projectContextToMarkdown)

## 3. CLI thin adapters

- [x] 3.1 Delegate `change context` text mode to SDK helper
      `packages/cli/src/commands/change/context.ts`: `registerChangeContext`
      Approach: always call `changeContextToMarkdown(context, { changeName: name })` for text (including unchanged); keep warnings on stderr and json/toon passthrough; remove local fingerprint/catalogue helpers and early unchanged assembly branch
      (Req: Output — cli:change-context)

- [x] 3.2 Delegate `project context` text mode to SDK helper
      `packages/cli/src/commands/project/context.ts`: `registerProjectContext`
      Approach: replace inline assembly with `projectContextToMarkdown(context)`; keep empty-message behaviour via helper return value
      (Req: Output — cli:project-context)

- [x] 3.3 Update change-context CLI tests
      `packages/cli/test/commands/change-context.spec.ts`
      Approach: replace blanket `spec-preview` expectations with source-aware assertions; no preview hint when catalogue has only canonical sources
      (Req: Output scenarios)

- [x] 3.4 Update project-context CLI tests
      `packages/cli/test/commands/project-context.spec.ts`
      Approach: assert `specs context` hint present and `spec-preview` absent in text output
      (Req: Output scenarios)

## 4. Documentation

- [x] 4.1 Update CLI reference catalogue guidance
      `docs/cli/cli-reference.md` — change context section
      Approach: replace blanket `spec-preview` note with source-aware hints (`specIds` → preview; other → `specs context`)
      (Req: default:\_global/docs)

- [x] 4.2 Update context-compilation guide
      `docs/guide/_sections/getting-started/context-compilation.md`
      Approach: same source-aware drill-down guidance for agents
      (Req: default:\_global/docs)

- [x] 4.3 Update project context CLI docs
      `docs/cli/` project-context entry — catalogue uses `specs context` only; never `spec-preview`
      Approach: mirror SDK/project helper contract
      (Req: default:\_global/docs)

- [x] 4.4 Document SDK presentation helpers
      `docs/sdk/` — `changeContextToMarkdown` / `projectContextToMarkdown` API notes for hosts
      Approach: signatures, options, grouping/hint table, unchanged message
      (Req: Module location; default:\_global/docs)

## 5. Manual verification

- [x] 5.1 Smoke-test change and project context text output
      Manual: run `change context <name> designing` and `project context --format text`
      Approach: confirm fingerprint, no blanket preview for deps, `specs context` for canonical catalogue; project never shows `spec-preview`
      (Req: Manual / E2E from design)
