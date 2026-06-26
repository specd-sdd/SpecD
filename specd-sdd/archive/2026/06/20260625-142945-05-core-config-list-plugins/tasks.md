# Tasks: 05-core-config-list-plugins

## 1. Core — remove ListPlugins use case

- [x] 1.1 Delete ListPlugins application use case file
      `packages/core/src/application/use-cases/list-plugins.ts`: `ListPlugins`, `ListPluginsInput`, `ListPluginsEntry` — remove entire file
      Approach: delete file; no replacement in application layer
      (Req: Plugin declarations are not a kernel use case)

- [x] 1.2 Delete ListPlugins composition factory file
      `packages/core/src/composition/use-cases/list-plugins.ts`: `createListPlugins`, `FsListPluginsOptions` — remove entire file
      Approach: delete file
      (Req: Plugin declarations are not a kernel use case)

- [x] 1.3 Remove ListPlugins exports from application use-cases barrel
      `packages/core/src/application/use-cases/index.ts` — remove `ListPlugins`, `ListPluginsInput`, `ListPluginsEntry` export line
      Approach: delete export only; ensure no remaining imports in package
      (Req: Plugin declarations are not a kernel use case)

- [x] 1.4 Remove createListPlugins exports from composition use-cases barrel
      `packages/core/src/composition/use-cases/index.ts` — remove `createListPlugins`, `FsListPluginsOptions` export line
      Approach: delete export only
      (Req: Plugin declarations are not a kernel use case)

- [x] 1.5 Delete ListPlugins unit test file
      `packages/core/test/application/use-cases/list-plugins.spec.ts` — remove file
      Approach: delete; use case no longer exists
      (Req: Plugin declarations are not a kernel use case)

## 2. Core — remove kernel.project.listPlugins

- [x] 2.1 Remove listPlugins from Kernel interface
      `packages/core/src/composition/kernel.ts`: `Kernel['project']` — delete `listPlugins: ListPlugins` property
      Approach: remove type member and `ListPlugins` import
      (Req: Plugin declarations are not a kernel use case)

- [x] 2.2 Remove listPlugins wiring from createKernel
      `packages/core/src/composition/kernel.ts`: `createKernel` — delete `listPlugins: new ListPlugins(i.configWriter)` from `project` object
      Approach: remove construction line only; keep other project entries
      (Req: Plugin declarations are not a kernel use case; kernel.project does not expose listPlugins)

## 3. CLI — getDeclaredPlugins helper

- [x] 3.1 Create getDeclaredPlugins helper module
      `packages/cli/src/commands/plugins/get-declared-plugins.ts`: `getDeclaredPlugins`, `DeclaredPluginEntry` — new pure function
      Approach: `const plugins = config.plugins as Readonly<Record<string, readonly DeclaredPluginEntry[] | undefined>> | undefined`; return `plugins?.[type] ?? []`
      (Req: Declaration source)

- [x] 3.2 Add unit tests for getDeclaredPlugins
      `packages/cli/test/commands/plugins/get-declared-plugins.spec.ts` — new file
      Approach: given config with `plugins.agents`, when type `agents` then entries returned; when type `missing` then `[]`; when plugins undefined then `[]`
      (Req: Declaration source; Unknown type yields empty declaration list)

## 4. CLI — migrate plugins list command

- [x] 4.1 Replace listPlugins call in plugins list action
      `packages/cli/src/commands/plugins/list.ts`: `registerPluginsList` action — use `getDeclaredPlugins(config, type)` instead of `kernel.project.listPlugins.execute`
      Approach: import helper; remove `kernel` and `configPath` if unused after change; keep `types` default `['agents']`
      (Req: Declaration source; Default type is agents when --type omitted)

## 5. CLI — migrate install and update

- [x] 5.1 Replace listPlugins in installPluginsWithKernel
      `packages/cli/src/commands/plugins/install.ts`: `installPluginsWithKernel` — use `getDeclaredPlugins(input.config, 'agents')`
      Approach: replace execute call; drop `kernel` from params and callers if unused; keep `ConfigWriter.addPlugin` write path unchanged
      (Req: cli:plugins-install Declaration source; Already-installed handling)

- [x] 5.2 Replace listPlugins in updatePluginsWithKernel
      `packages/cli/src/commands/plugins/update.ts`: `updatePluginsWithKernel` — use `getDeclaredPlugins(input.config, 'agents')`
      Approach: same as install; update-all derives names from declared agents list
      (Req: cli:plugins-update Declaration source; Update behavior)

## 6. CLI — update tests

- [x] 6.1 Update plugins list command tests
      `packages/cli/test/commands/plugins.spec.ts` — remove `kernel.project.listPlugins` mocks; set `config.plugins.agents` on test config
      Approach: stub declared plugins on loaded config object passed to command
      (Req: Declarations read from loaded config snapshot)

- [x] 6.2 Update plugins update command tests
      `packages/cli/test/commands/plugins-update.spec.ts` — same pattern as plugins.spec.ts
      Approach: config.plugins instead of listPlugins mock
      (Req: Declarations read from loaded config snapshot)

- [x] 6.3 Remove listPlugins from mock kernel helper
      `packages/cli/test/commands/helpers.ts` — delete `listPlugins` entry from mock `kernel.project`
      Approach: remove property; fix any tests still referencing it
      (Req: kernel.project does not expose listPlugins)

## 7. Documentation

- [x] 7.1 Update plugins list CLI docs
      `docs/cli/plugins-list.md` — replace ConfigWriter.listPlugins description with SpecdConfig.plugins from loadConfig
      Approach: document declaration source is in-memory config snapshot
      (Req: Declaration source)

- [x] 7.2 Update get-config core docs
      `docs/core/get-config.md` — add note that plugin declarations are read from `execute().plugins`, not a list use case
      Approach: short paragraph under usage examples
      (Req: Plugin declarations are not a kernel use case)

## 8. Verification

- [x] 8.1 Run core package tests
      `packages/core` — `pnpm --filter @specd/core test`
      Approach: all tests pass after ListPlugins removal
      (Req: kernel.project does not expose listPlugins)

- [x] 8.2 Run cli package tests
      `packages/cli` — `pnpm --filter @specd/cli test`
      Approach: plugins list/install/update tests pass
      (Req: Declaration source; Plugin status detection; Output format)

- [x] 8.3 Manual smoke test plugins list
      CLI — `node packages/cli/dist/index.js plugins list` and `--format json`
      Approach: command runs without TypeError; output matches declared plugins in specd.yaml
      (Req: Command signature; Output format)
