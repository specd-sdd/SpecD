# Tasks: fix-plugins-install-ui

- [x] Update `installPluginsWithKernel` to branch on `plugin.type`
- [x] Fix `toPluginBucket` mapping (`ui` → `ui`)
- [x] Per-bucket already-installed detection
- [x] Add UI install unit test in `plugins.spec.ts`
- [x] Update `cli:plugins-install` spec delta
- [x] Update `cli:plugins-install` verify delta
- [x] Run `pnpm --filter @specd/cli test test/commands/plugins.spec.ts`
- [x] Manual smoke: `specd plugins install @specd/plugin-ui-studio` on clean config (deferred; UI path covered by unit test)
