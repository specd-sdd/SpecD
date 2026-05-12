# Tasks: move-change-locks-to-config-tmp

## 1. RepositoryConfig base

- [x] 1.1 Add configPath field to RepositoryConfig
- [x] 1.2 Add configPath() accessor to Repository base class

## 2. Kernel composition (all repositories)

- [x] 2.1 Pass configPath to all repository factories
- [x] 2.2 Update all use-case context factories

## 3. FsChangeRepository implementation

- [x] 3.1 Update FsChangeRepository to derive locksPath from configPath

## 4. Tests

- [x] 4.1 Update test fixtures with configPath
- [x] 4.2 Update lock directory assertions

## 5. Validate and Transition

- [x] 5.1 Build: `pnpm build` ✓
- [x] 5.2 Run tests: `pnpm test` ✓
- [x] 5.3 Run lint (pre-existing errors)
- [x] 5.4 Transition to verifying
