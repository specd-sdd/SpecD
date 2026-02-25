# Agent: specd Bootstrap (Advanced)

> Temporary working document. Final location TBD.

## What this agent does

Deep-analyzes an existing repository and generates a complete specd bootstrap under `.specd/`:

1. `specd-bootstrap.md` — project overview, architecture, domain map
2. `.specd/specs/<domain>/spec.md` — draft spec per identified domain
3. `.specd/specs/<domain>/verify.md` — draft verification scenarios per domain (from tests)
4. `.specd/specs/_global/conventions/spec.md` — detected coding conventions
5. `.specd/specs/_global/architecture/spec.md` — detected architectural pattern and rules
6. `.specd/specd.yaml` — suggested starter configuration

All output lives under `.specd/` and is clearly marked `DRAFT`. Nothing is binding until
the team promotes it to `specs/`.

## When to run

- When adding specd to a large or complex existing project
- When you want the most complete possible bootstrap, including verification scenarios
- Run basic first if unsure — advanced reads extensively and is significantly more expensive

## Instructions

When this agent is invoked:

1. Ask the user for the project root path if not already known.
2. Warn the user: this is expensive. It reads source, tests, schemas, API definitions,
   migrations, and CI config, then generates multiple files per domain.
3. Launch the orchestrator subagent using the Task tool with:
   - `subagent_type: general-purpose`
   - `model: haiku`
   - The full prompt below, substituting `<project-root>`.

---

## Subagent prompt

```
You are performing a deep analysis of the repository at <project-root> to bootstrap specd.

Your goal is to generate the following files, all under .specd/:

- specd-bootstrap.md
- specs/_global/conventions/spec.md
- specs/_global/architecture/spec.md
- specs/<domain>/spec.md  (one per domain)
- specs/<domain>/verify.md  (one per domain, from tests)
- specd.yaml (suggested starter config)

Everything is a DRAFT. Mark it clearly. Nothing is binding until the team promotes it.

### Step 0 — Create progress tasks

Create these tasks before doing any other work:
- "Explore structure" (activeForm: "Exploring repository structure")
- "Read documentation" (activeForm: "Reading documentation and config")
- "Read schemas and APIs" (activeForm: "Reading data models and API definitions")
- "Read CI and env config" (activeForm: "Reading CI/CD and environment config")
- "Identify domains" (activeForm: "Identifying domains")
- "Analyse domains" (activeForm: "Analysing domain source files and tests")
- "Write global specs" (activeForm: "Writing global specs")
- "Write domain specs" (activeForm: "Writing domain specs and verify files")
- "Write specd.yaml" (activeForm: "Writing specd.yaml")
- "Write specd-bootstrap.md" (activeForm: "Writing bootstrap overview")

Mark each in_progress when you start it and completed when done.

### Step 1 — Explore structure

Mark "Explore structure" in_progress.

Map the full repository structure:
- Monorepo or single package? If monorepo, list all packages/workspaces.
- Language, runtime, package manager, build tool, test framework
- Top-level source directories and their apparent purpose
- Test directories and naming pattern (*.spec.ts, *_test.go, test_*.py, etc.)
- Existing docs, ADRs, architecture decision records
- Architectural pattern signals: look for directory names like domain/, application/,
  infrastructure/, adapters/, ports/, controllers/, services/, repositories/, usecases/,
  handlers/, events/, commands/, queries/. Identify: hexagonal/ports-and-adapters, layered
  (presentation/domain/data), clean architecture, MVC, CQRS, event-sourcing, microservices,
  modular monolith.
- Event-driven signals: presence of events/, handlers/, subscribers/, publishers/,
  message queues, kafka/rabbitmq/sns config.

Mark "Explore structure" completed.

### Step 2 — Read documentation

Mark "Read documentation" in_progress.

Read if present:
- README.md, ARCHITECTURE.md, CONTRIBUTING.md, DESIGN.md, AGENTS.md, CLAUDE.md
- .github/copilot-instructions.md, docs/ directory (up to 10 files)
- Root package manifest (package.json, Cargo.toml, pyproject.toml, go.mod)
- Any existing specd.yaml or .specd/ directory contents
- ADR files (docs/adr/, docs/decisions/, .decisions/)
- Up to 8 representative source files from the core domain (not tests, not config)
- CHANGELOG.md or HISTORY.md — reveals past decisions and constraints

Mark "Read documentation" completed.

### Step 3 — Read schemas and APIs

Mark "Read schemas and APIs" in_progress.

Read if present — these are rich sources of requirements:

**Data model definitions:**
- Prisma schema (prisma/schema.prisma, schema.prisma)
- TypeORM entities (src/**/*.entity.ts)
- Sequelize models (src/**/*.model.ts)
- SQL migrations (migrations/, db/migrate/, src/migrations/)
- MongoDB schemas (src/**/*.schema.ts)
- Drizzle schema files
- Any *.sql files that define tables or constraints

**API definitions:**
- OpenAPI / Swagger (openapi.yaml, swagger.yaml, api.yaml, docs/api/)
- Protocol Buffers (*.proto)
- GraphQL schemas (*.graphql, *.gql, schema.graphql)
- tRPC router definitions
- gRPC service definitions

**Event / message schemas:**
- Event type definitions (events/, src/**/events.ts, src/**/*.event.ts)
- Message schema files
- AsyncAPI specs if present

For each file found, extract: entity names, field names and types, relationships,
constraints (unique, required, foreign keys, enums), and any documented invariants.

Mark "Read schemas and APIs" completed.

### Step 4 — Read CI, env config, and tooling

Mark "Read CI and env config" in_progress.

Read if present:
- .github/workflows/*.yml — reveals quality gates, test requirements, deployment steps
- .env.example, .env.template — reveals required configuration and its purpose
- docker-compose.yml — reveals runtime dependencies and service topology
- Dockerfile — reveals runtime constraints
- Any config/ directory with app configuration schemas
- Feature flag definitions if present
- eslint.config.*, .eslintrc.*, .prettierrc, rustfmt.toml — coding standards enforced by tooling
- jest.config.*, vitest.config.*, pytest.ini — test configuration, coverage thresholds
- tsconfig.json, .strictnullchecks, compiler options — type safety constraints

Extract: required env vars and their purpose, external service dependencies, quality gates
(coverage thresholds, lint requirements), deployment constraints, enforced code style rules.

Mark "Read CI and env config" completed.

### Step 4b — Read recent git history

Run: git -C <project-root> log --oneline -50

Analyse the last 50 commits:
- Which directories/domains are most actively changed → signals what's important and in flux
- Commit message patterns → detect commit style (conventional commits, etc.)
- Recent refactors or renames → signals domain boundaries that may have shifted
- Any commits mentioning "breaking change", "invariant", "constraint", "fix" → potential requirements

Store observations in memory. Do not write to disk.

### Step 5 — Identify domains

Mark "Identify domains" in_progress.

From everything read, identify:

**Architecture:**
- The architectural pattern — be explicit: hexagonal, layered, clean, MVC, CQRS,
  event-sourcing, microservices, modular monolith, or mixed/unclear.
- Which layers exist and what goes in each.
- Whether the system is event-driven and what event bus/transport is used.

**Domains:**
- Group modules by business concern into 3–8 domains. Avoid one domain per file.
- For each domain: name, source paths, 1-line description, architectural layer.
- Cross-cutting concerns (auth, observability, error handling) — note them separately.

**Global conventions:**
- File naming (kebab-case, PascalCase, snake_case)
- Import style (relative vs absolute, barrel files, path aliases)
- Commit message format (conventional commits, etc.)
- Test location (co-located vs separate test/ directory)
- Code style (inferred from existing files)
- Error handling pattern (exceptions, Result types, error codes)

**Event catalog (if event-driven):**
- All named event types found, their payloads, who emits and who consumes them.

Mark "Identify domains" completed.

### Step 6 — Analyse domains

Mark "Analyse domains" in_progress.

For EACH domain, read its source files deeply and store in memory:

**From source files:**
- Named entities, types, interfaces, enums and their values
- State machines: all states and valid transitions
- Validation logic, guard clauses, preconditions, postconditions
- Public API surface: exported functions, class methods, their signatures
- Error types, when they are thrown, and what they signal
- Explicit invariants in comments, assertions, or validation schemas
- Data model fields from schema files for this domain

**From test files:**
- Test suite names and individual test descriptions → requirement names
- Edge cases and error scenarios → constraints and verify scenarios
- Setup/teardown → invariants and preconditions
- Mocks and stubs → integration points and port contracts

**Security model (per domain):**
- Auth checks: where authentication is enforced (middleware, guards, decorators)
- Authorization: permission checks, role/scope requirements, ownership validation
- Sensitive fields: passwords, tokens, PII marked in schemas or handled specially in code
- Input validation: sanitisation, injection prevention patterns

**Performance constraints (per domain):**
- Rate limiting: any rate limit decorators, middleware, or documented limits
- Pagination: patterns used (cursor, offset), default and max page sizes
- Timeouts: explicit timeout values in code or config
- Caching: what is cached, cache keys, TTL values

**Dependency graph:**
- For each domain, list which other domains it imports from (check import statements)
- This informs the Spec Dependencies section of each spec

**Test coverage gaps:**
- Domains with no test files → requirements are [inferred] only, flag prominently
- Domains with tests but low coverage → flag specific requirements as needing verification

**Confidence tracking:**
For each extracted requirement, note its source:
- `[docs]` — found in documentation
- `[test]` — derived from test descriptions or assertions
- `[code]` — inferred from implementation
- `[schema]` — derived from data model
- `[security]` — derived from auth/validation logic
- `[inferred]` — uncertain, needs human review

Mark "Analyse domains" completed.

### Step 7 — Write global specs

Mark "Write global specs" in_progress.

**Write .specd/specs/_global/architecture/spec.md:**

> ⚠️ DRAFT — Generated by specd bootstrap. Review and refine before treating as binding.

# Architecture

## Overview

<Describe the detected architectural pattern and its implications for the codebase.>

## Requirements

### Requirement: Architectural layers

<Describe each layer, what it contains, and what it must not depend on.>

### Requirement: Dependency direction

<Which layers may depend on which. E.g. "domain must not import from infrastructure".>

<Add more requirements for any strong architectural rules detected.>

## Constraints

<Hard rules detected: no circular deps, no framework imports in domain, etc.>

---

**Write .specd/specs/_global/conventions/spec.md:**

> ⚠️ DRAFT — Generated by specd bootstrap. Review and refine before treating as binding.

# Coding Conventions

## Overview

<Brief description of the coding conventions in use.>

## Requirements

### Requirement: File naming
<Detected naming convention.>

### Requirement: Import style
<Detected import patterns.>

### Requirement: Test organisation
<Where tests live and how they are named.>

### Requirement: Error handling
<Detected error handling pattern.>

### Requirement: Commit messages
<Detected commit style, if any.>

## Constraints

<Any hard rules around style, linting, formatting detected from config files.>

---

Mark "Write global specs" completed.

### Step 8 — Write domain specs and verify files

Mark "Write domain specs" in_progress.

For each domain, write two files:

**A) .specd/specs/<domain>/spec.md:**

> ⚠️ DRAFT — Generated by specd bootstrap. Review and refine before treating as binding.

# <Domain name>

## Overview

<2–3 sentences: what this domain is responsible for, why it exists, its role in the architecture.>

## Requirements

<One ### Requirement: <Name> section per identified behaviour.
Each requirement tagged with its confidence source: [docs], [test], [code], [schema], [inferred].
Write normative prose — what MUST be true, not how it is implemented.
Preserve named types, enums, states, error names, field names from the code.>

### Requirement: <Name> [<source>]

<Normative prose>

## Data Model

<If this domain owns data: list entities, their key fields, relationships, and constraints
extracted from schema files. Omit if domain has no data model.>

## API Surface

<If this domain exposes an API (REST, GraphQL, gRPC): list endpoints/operations and their
contracts. Omit if not applicable.>

## Events

<If this domain emits or consumes events: list event types, their payloads, and when they
are emitted. Omit if not applicable.>

## Error Types

<All named error types thrown by this domain and the conditions that trigger them.
Omit if no named error types found.>

## Security

<Authentication requirements, authorization rules, sensitive field handling.
Omit if this domain has no security-relevant logic.>

## Performance

<Rate limits, pagination constraints, timeouts, caching rules detected.
Omit if nothing concrete was found.>

## Constraints

<Hard invariants: validations, guards, assertions. One bullet per constraint.
Tag uncertain ones with TODO.>

## Spec Dependencies

<Other domains this one depends on, inferred from imports. Leave empty if unclear.>

---

**B) .specd/specs/<domain>/verify.md:**

> ⚠️ DRAFT — Generated by specd bootstrap. Derived from existing tests.

# Verification: <Domain name>

## Requirements

<For each requirement in spec.md that has test coverage, add scenarios derived from
the actual test cases. Use BDD format.>

### Requirement: <Name>

#### Scenario: <test description as scenario name>

- **GIVEN** <preconditions from test setup>
- **WHEN** <action from test>
- **THEN** <assertions from test>

<Repeat for each test case covering this requirement.>

---

Mark each domain task in_progress and completed as you write its files.
Mark "Write domain specs" completed when all domains are done.

### Step 9 — Write specd.yaml

Mark "Write specd.yaml" in_progress.

Write .specd/specd.yaml with a suggested starter config based on what was found:

> # specd.yaml — DRAFT starter config. Review before moving to project root.

schema: '@specd/schema-std'

<if monorepo, add workspaces section with detected package paths>

contextIncludeSpecs:
  - '_global/architecture'
  - '_global/conventions'
  <add other specs that look globally relevant>

contextExcludeSpecs: []

<if commit style was detected, add artifactRules for spec artifact>

Mark "Write specd.yaml" completed.

### Step 10 — Write specd-bootstrap.md

Mark "Write specd-bootstrap.md" in_progress.

Write <project-root>/specd-bootstrap.md:

---

# specd Bootstrap — <project name>

> Generated by specd bootstrap agent (advanced). Review and refine before use.

## Project overview

<2–3 sentences: what it does, who it's for, why it exists>

## Tech stack

- **Language**: <language and version>
- **Runtime**: <runtime>
- **Package manager**: <pm>
- **Build**: <build tool>
- **Test**: <test framework>
- **Key deps**: <2–5 most important>
- **Event transport**: <kafka/rabbitmq/sns/none — omit if not event-driven>

## Architecture

**Pattern**: <hexagonal / layered / clean / MVC / CQRS / event-sourcing / mixed / unclear>

<2–3 sentences on structure and what it means for specs>

## Repository structure

<monorepo/single + one line per package or top-level dir>

## Domain map

<One line per domain: .specd/specs/<domain> → what it does, which layer>

## Cross-cutting concerns

<Auth mechanism (JWT/session/OAuth/API key), permission model (RBAC/ABAC/ownership),
observability (logging/metrics/tracing), error handling pattern, validation approach>

## Security model

<How authentication and authorization work across the system. Sensitive data categories
identified (PII, credentials, tokens). Omit if nothing concrete found.>

## Performance constraints

<Rate limits, pagination defaults, timeout values, caching strategies detected.
Omit if nothing concrete found.>

## Most active domains (from git history)

<Top 3–5 domains by commit frequency in the last 50 commits — signals where to focus spec work>

## Event catalog

<If event-driven: list event types and their producers/consumers. Omit otherwise.>

## Environment dependencies

<Required env vars and external services detected from .env.example and docker-compose>

## Conventions detected

- <file naming>
- <import style>
- <commit format>
- <test location>
- <error handling>

## Generated files

**Global specs:**
- .specd/specs/_global/architecture/spec.md
- .specd/specs/_global/conventions/spec.md

**Domain drafts:**
<list of .specd/specs/<domain>/spec.md and verify.md files>

**Config:**
- .specd/specd.yaml

To promote a draft spec to binding:
1. Review and correct requirements
2. Fill in Spec Dependencies
3. Move to specs/<domain>/spec.md (and verify.md)
4. Remove the DRAFT warning
5. Run /specd-spec-metadata to generate .specd-metadata.yaml

---

Mark "Write specd-bootstrap.md" completed.

## Notes

- Never invent — only document what you found in source, tests, schemas, or docs
- If a constraint is uncertain, tag it TODO and note the source
- State machine transitions are normative — always include them
- Test descriptions are strong signals but may be incomplete or outdated
- Requirements tagged [inferred] need the most human review
- Omit sections that have nothing real to say — do not fill with guesses
- The event catalog and data model sections are high value — prioritise them if present
```
