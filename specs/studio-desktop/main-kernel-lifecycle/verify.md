# Verification: Main Kernel Lifecycle

## Requirements

### Requirement: one kernel per open local project

#### Scenario: Local open uses createSdkContext

- **WHEN** the user opens a local project directory
- **THEN** the main process awaits `createSdkContext` from `@specd/sdk` once for that project root
- **AND** it does not call `createKernel` from `@specd/core` directly

### Requirement: project switch tears down kernel and graph state

#### Scenario: Opening new folder disposes old kernel

- **GIVEN** project A is open
- **WHEN** user opens project B folder
- **THEN** kernel A disposed
- **AND** kernel B serves IPC

#### Scenario: Graph provider reset on switch

- **WHEN** project switch completes
- **THEN** in-memory graph cache cleared
- **AND** status reflects new project paths

#### Scenario: In-flight IPC cancelled on switch

- **GIVEN** long IPC call running for project A
- **WHEN** switch to B starts
- **THEN** A requests rejected or aborted
- **AND** B calls do not read A paths

### Requirement: desktop startup prepares the Electron SQLite graph runtime

#### Scenario: Desktop package exposes Electron graph rebuild wiring

- **WHEN** the desktop package scripts are inspected
- **THEN** `rebuild:graph-sqlite-electron` rebuilds the locally generated vendored
  Electron SQLite addon
- **AND** `rebuild:graph-electron` aliases that rebuild
- **AND** `prestart` executes the Electron SQLite rebuild before app startup

#### Scenario: Desktop startup does not require git-tracked vendor artifacts

- **GIVEN** a fresh clone without committed vendored sqlite artifacts
- **WHEN** desktop startup preparation runs
- **THEN** it triggers the Electron sqlite rebuild workflow
- **AND** desktop local graph startup does not depend on vendored sqlite files being
  present in git

#### Scenario: Desktop local host depends on the Electron graph package

- **WHEN** the desktop package dependencies are inspected
- **THEN** `@specd/code-graph-electron` is present for desktop-local graph execution

#### Scenario: CLI and API keep the standard graph package

- **WHEN** CLI and API package dependencies are inspected
- **THEN** they depend on `@specd/code-graph`
- **AND** they do not depend on `@specd/code-graph-electron`

### Requirement: desktop main process launches as Electron

#### Scenario: start clears ELECTRON_RUN_AS_NODE

- **WHEN** `pnpm start` runs in `apps/specd-studio-desktop`
- **THEN** the spawned Electron process can access `app.whenReady`
- **AND** `require('electron')` in the main bundle is not the npm CLI path string

### Requirement: main process entry is bundled for pnpm and Electron

#### Scenario: main entry uses bundled CJS artifact

- **WHEN** inspecting `apps/specd-studio-desktop/package.json` after build
- **THEN** `main` is `dist/main/index.cjs`
- **AND** `tsup` externalises `electron`, `@specd/code-graph-electron`, `@specd/sdk`, and `@specd/client`

### Requirement: desktop kernel configures plain-text logs

#### Scenario: Local desktop logs are formatted without colors

- **WHEN** desktop local kernel is created
- **THEN** logFormatter has colorize set to false
- **AND** log messages do not contain ANSI escape control codes
