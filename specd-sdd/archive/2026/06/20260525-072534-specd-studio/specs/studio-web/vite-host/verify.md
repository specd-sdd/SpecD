# Verification: Vite Host

## Requirements

### Requirement: package exposes standard vite scripts

#### Scenario: dev script starts Vite dev server

- **WHEN** `pnpm dev` runs in studio-web package
- **THEN** Vite serves on configured port
- **AND** HMR enabled

#### Scenario: build script emits static dist

- **WHEN** `pnpm build` runs
- **THEN** `dist/` contains `index.html` and assets
- **AND** ready for `ui serve`

#### Scenario: preview script serves production build

- **WHEN** `pnpm preview` runs after build
- **THEN** static files served locally
- **AND** no kernel bootstrap in process

### Requirement: host does not bootstrap a Specd kernel

#### Scenario: Vite dev server has no Kernel import

- **WHEN** studio-web dev server starts
- **THEN** no `@specd/core` kernel in Node process
- **AND** API calls go to remote URL

#### Scenario: Renderer uses SpecdDataPort remote adapter

- **WHEN** `<SpecdApp>` mounts after connect
- **THEN** HTTP transport only
- **AND** no IPC bridge in web build

#### Scenario: Missing API shows connect error not kernel crash

- **GIVEN** no server at configured URL
- **WHEN** health check runs
- **THEN** connect panel shows error
- **AND** process does not throw kernel init error

### Requirement: Vite receives API base from ui serve

#### Scenario: dev server uses injected API base URL

- **GIVEN** studio-web is launched via `specd ui serve`
- **WHEN** the app boots in the browser
- **THEN** the connect default API URL matches the server-provided base
