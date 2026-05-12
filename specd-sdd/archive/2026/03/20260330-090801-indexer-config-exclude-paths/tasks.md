# Tasks: indexer-config-exclude-paths

## 1. Core types — SpecdWorkspaceConfig

- [x] 1.1 Add `SpecdWorkspaceGraphConfig` interface
      `packages/core/src/application/specd-config.ts`:
      new exported interface — `respectGitignore?: boolean`, `excludePaths?: readonly string[]`
      Approach: add above `SpecdWorkspaceConfig`; JSDoc each field explaining defaults and semantics
      (Req: Workspace graph config)

- [x] 1.2 Add `graph?` field to `SpecdWorkspaceConfig`
      `packages/core/src/application/specd-config.ts`:
      `SpecdWorkspaceConfig` — add `readonly graph?: SpecdWorkspaceGraphConfig`
      Approach: add after `contextExcludeSpecs?`; mark optional — absent means built-in defaults apply
      (Req: Workspace graph config)

## 2. Config loader — YAML parsing and validation

- [x] 2.1 Add `WorkspaceGraphZodSchema` to config loader
      `packages/core/src/infrastructure/fs/config-loader.ts`:
      new `WorkspaceGraphZodSchema` — `z.object({ respectGitignore: z.boolean().optional(), excludePaths: z.array(z.string()).optional() }).strict()`
      Approach: define above `WorkspaceRawZodSchema`; `.strict()` rejects unknown fields at startup consistent with the rest of the schema
      (Req: Workspace graph config, Startup validation)

- [x] 2.2 Add `graph` field to `WorkspaceRawZodSchema`
      `packages/core/src/infrastructure/fs/config-loader.ts`:
      `WorkspaceRawZodSchema` — add `graph: WorkspaceGraphZodSchema.optional()`
      Approach: insert after `contextExcludeSpecs`; the existing `.strict()` on `WorkspaceRawZodSchema` now also covers `graph`'s subfields via `WorkspaceGraphZodSchema.strict()`
      (Req: Startup validation)

- [x] 2.3 Pass `graph` from raw YAML to `SpecdWorkspaceConfig`
      `packages/core/src/infrastructure/fs/config-loader.ts`:
      workspace builder block (~line 445) — conditionally spread `graph` field
      Approach: `...(ws.graph !== undefined ? { graph: { ...(ws.graph.respectGitignore !== undefined ? { respectGitignore: ws.graph.respectGitignore } : {}), ...(ws.graph.excludePaths !== undefined ? { excludePaths: ws.graph.excludePaths } : {}) } } : {})`
      (Req: Workspace graph config)

## 3. WorkspaceIndexTarget — type extension

- [x] 3.1 Add `excludePaths` and `respectGitignore` to `WorkspaceIndexTarget`
      `packages/code-graph/src/domain/value-objects/index-options.ts`:
      `WorkspaceIndexTarget` — add `readonly excludePaths?: readonly string[]` and `readonly respectGitignore?: boolean`
      Approach: add after `repoRoot?`; JSDoc: `excludePaths` — replaces built-in defaults when set; `respectGitignore` — default `true`, `false` skips gitignore loading
      (Req: WorkspaceIndexTarget)

## 4. discoverFiles — core exclusion logic

- [x] 4.1 Export `DEFAULT_EXCLUDE_PATHS` constant and `DiscoverFilesOptions` interface
      `packages/code-graph/src/application/use-cases/discover-files.ts`:
      replace `EXCLUDED_DIRS` Set with exported `DEFAULT_EXCLUDE_PATHS: readonly string[]` and add exported `DiscoverFilesOptions` interface
      Approach: `DEFAULT_EXCLUDE_PATHS = ['node_modules/', '.git/', '.specd/', 'dist/', 'build/', 'coverage/', '.next/', '.nuxt/']`; `DiscoverFilesOptions = { excludePaths?: readonly string[]; respectGitignore?: boolean }`; export both
      (Req: Multi-workspace file discovery)

- [x] 4.2 Add `options` parameter and build config ignore instance
      `packages/code-graph/src/application/use-cases/discover-files.ts`:
      `discoverFiles` signature — add `options?: DiscoverFilesOptions` as third param; build `configIg` from `options?.excludePaths ?? DEFAULT_EXCLUDE_PATHS`
      Approach: `const configIg = ignore(); configIg.add([...(options?.excludePaths ?? DEFAULT_EXCLUDE_PATHS)])`; place after `scopedIgnores` declaration
      (Req: Multi-workspace file discovery)

- [x] 4.3 Make gitignore loading conditional on `respectGitignore`
      `packages/code-graph/src/application/use-cases/discover-files.ts`:
      gitignore loading block (lines 63–71) — wrap in `if (options?.respectGitignore !== false)`
      Approach: guard `findGitRoot` call and both `loadIgnoreFile` calls; when `false`, `scopedIgnores` stays empty and layer 1 is skipped entirely
      (Req: Multi-workspace file discovery, `.gitignore handling for codeRoot`)

- [x] 4.4 Update `isIgnored` to use two-layer evaluation
      `packages/code-graph/src/application/use-cases/discover-files.ts`:
      `isIgnored()` — evaluate gitignore layer first (absolute priority), then config layer
      Approach: if `options?.respectGitignore !== false`: run existing gitignore logic; if any scope marks `ignored = true`, `return true` immediately (gitignore cannot be overridden). Then apply `configIg.test(target)`: if `result.ignored` return `true`; if `result.unignored` return `false`; else return `false`
      (Req: Multi-workspace file discovery — gitignore absolute priority scenario)

- [x] 4.5 Remove `EXCLUDED_DIRS` guard from `walk()`
      `packages/code-graph/src/application/use-cases/discover-files.ts`:
      `walk()` — remove `if (EXCLUDED_DIRS.has(entry)) continue` (line 126)
      Approach: directory exclusion is now handled entirely by `isIgnored(relPath, true)` which runs `configIg` against the dir path with trailing `/`; `node_modules/` pattern matches `node_modules/` directory correctly
      (Req: Multi-workspace file discovery)

## 5. Index use case — pass options through

- [x] 5.1 Pass workspace exclusion options to `discoverFiles`
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`:
      `discoverFiles` call (line 174) — add third argument with options from workspace target
      Approach: `discoverFiles(ws.codeRoot, (filePath) => ..., { excludePaths: ws.excludePaths, respectGitignore: ws.respectGitignore })`; both are `undefined` when absent, which triggers defaults in `discoverFiles`
      (Req: Multi-workspace file discovery)

## 6. CLI — build-workspace-targets

- [x] 6.1 Forward graph config to `WorkspaceIndexTarget`
      `packages/cli/src/commands/graph/build-workspace-targets.ts`:
      `buildWorkspaceTargets()` target construction — conditionally spread `excludePaths` and `respectGitignore` from `ws.graph`
      Approach: `...(ws.graph?.excludePaths !== undefined ? { excludePaths: ws.graph.excludePaths } : {}), ...(ws.graph?.respectGitignore !== undefined ? { respectGitignore: ws.graph.respectGitignore } : {})`
      (Req: WorkspaceIndexTarget — graph config fields flow from SpecdWorkspaceConfig)

## 7. Package exports

- [x] 7.1 Re-export `DEFAULT_EXCLUDE_PATHS` from `@specd/code-graph`
      `packages/code-graph/src/index.ts`:
      add named re-export of `DEFAULT_EXCLUDE_PATHS` from `./application/use-cases/discover-files.js`
      Approach: `export { DEFAULT_EXCLUDE_PATHS } from './application/use-cases/discover-files.js'`; the CLI needs it for the merge logic in task 8.2
      (Req: Indexing behaviour — --exclude-path merges on top)

## 8. CLI — graph index command

- [x] 8.1 Add `--exclude-path` flag to `graph index`
      `packages/cli/src/commands/graph/index-graph.ts`:
      `.option()` call — add repeatable `--exclude-path <pattern>` using accumulator
      Approach: `.option('--exclude-path <pattern>', 'gitignore-syntax pattern to exclude (repeatable; merges with config)', (val: string, prev: string[]) => [...prev, val], [] as string[])`; add to the opts type: `excludePath: string[]`
      (Req: Command signature)

- [x] 8.2 Merge `--exclude-path` flags with workspace config
      `packages/cli/src/commands/graph/index-graph.ts`:
      action — after `buildWorkspaceTargets`, apply CLI overrides before `provider.index()`
      Approach: import `DEFAULT_EXCLUDE_PATHS` from `@specd/code-graph`; `const workspacesWithOverrides = opts.excludePath.length > 0 ? workspaces.map((ws) => ({ ...ws, excludePaths: [...(ws.excludePaths ?? DEFAULT_EXCLUDE_PATHS), ...opts.excludePath] })) : workspaces`; pass `workspacesWithOverrides` to `provider.index()`
      (Req: Indexing behaviour — --exclude-path merges on top)

## 9. Tests

- [x] 9.1 Create `discover-files.spec.ts` unit tests
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts` (new file):
      unit tests using tmp dir fixtures — cover all new scenarios
      Approach: use `mkdtempSync` fixtures; test: (a) defaults exclude `node_modules/`; (b) custom `excludePaths` replaces defaults — `node_modules/` visible, custom dir excluded; (c) negation re-includes subdirectory (`.specd/*` + `!.specd/metadata/`); (d) `respectGitignore: false` ignores `.gitignore`; (e) gitignore absolute priority — `!generated/` in `excludePaths` cannot re-include gitignored dir; (f) empty `excludePaths` array excludes nothing
      (Req: verify scenarios — indexer)

- [x] 9.2 Add config loader tests for `graph` block
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` (existing):
      new describe block `graph workspace config` — cover all new scenarios
      Approach: add cases: (a) `graph.excludePaths` and `graph.respectGitignore` parsed correctly; (b) `graph` absent → `undefined` on workspace; (c) `graph.respectGitignore: "yes"` → `ConfigValidationError`; (d) `graph.excludePaths: "node_modules/"` (string) → `ConfigValidationError`; (e) `graph.unknownField: true` → `ConfigValidationError`
      (Req: verify scenarios — core/config)

- [x] 9.3 Add workspace indexing integration tests
      `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts` (existing):
      new cases — verify that `excludePaths` and `respectGitignore` from `WorkspaceIndexTarget` are passed through to `discoverFiles` correctly
      Approach: stub `discoverFiles` or use real tmp dirs; assert files matching excluded patterns are not present in the index result
      (Req: verify scenarios — workspace-integration)

## 10. Documentation

- [x] 10.1 Add `## graph` section to CLI reference
      `docs/cli/cli-reference.md`:
      new `## graph` section — all five subcommands documented
      Approach: insert after `## config`; for each subcommand use same format as existing sections (`### graph index`, `### graph search`, etc.); for `graph index` include: full signature with `--exclude-path`, description of `graph.excludePaths` and `graph.respectGitignore` config fields, built-in defaults list, replace semantics explanation, negation example (`.specd/*` + `!.specd/metadata/`)
      (Req: CLI reference documentation)
