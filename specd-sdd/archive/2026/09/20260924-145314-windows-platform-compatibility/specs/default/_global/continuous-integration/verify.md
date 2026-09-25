# Verification: Continuous Integration

## Requirements

### Requirement: Workflow file is tracked

#### Scenario: Only workflows are re-included

- **GIVEN** `.gitignore` ignores the contents of `.github/`
- **WHEN** Git evaluates `.github/workflows/ci.yml` and `.github/copilot-instructions.md`
- **THEN** `ci.yml` is not ignored
- **AND** `copilot-instructions.md` stays ignored

### Requirement: Three operating systems

#### Scenario: One red runner fails the check

- **GIVEN** the macOS and Ubuntu jobs pass
- **AND** the Windows job fails
- **WHEN** GitHub aggregates the workflow
- **THEN** the check is failing

### Requirement: When the workflow runs

#### Scenario: A pull request starts the workflow

- **WHEN** a pull request is opened or updated
- **THEN** `ci.yml` runs
- **AND** it does not call a Gemini workflow

#### Scenario: A push to main starts the workflow

- **WHEN** commits are pushed to `main`
- **THEN** `ci.yml` runs

### Requirement: Toolchain install

#### Scenario: Native modules come from pnpm install

- **WHEN** a job prepares the repo
- **THEN** it installs pnpm `10.6.5` and Node 22
- **AND** it runs `pnpm install --frozen-lockfile`
- **AND** it does not apt-install, brew-install, or choco-install a compiler for `better-sqlite3`

### Requirement: Checks

#### Scenario: The three commands run in order

- **WHEN** a job runs after install
- **THEN** it runs `pnpm typecheck`, then `pnpm build`, then `pnpm test`

#### Scenario: pnpm test includes guide, sdk, skills, and plugins

- **WHEN** `pnpm test` runs
- **THEN** Vitest runs for `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and each `@specd/plugin-agent-*` package
- **AND** it also runs for `@specd/core`, `@specd/cli`, and `@specd/code-graph`
- **AND** it does not run `@specd/mcp` or `@specd/public-web`
