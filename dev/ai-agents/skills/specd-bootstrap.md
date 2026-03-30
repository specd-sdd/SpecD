# Agent: specd Bootstrap

> Source of truth: `.claude/skills/specd-bootstrap/SKILL.md`
> This file is the working draft. Do not edit the skill directly — edit here first, then sync.

## What this agent does

Deep-analyzes an existing repository using **code graph intelligence** and source analysis
to generate:

1. `specd-bootstrap.md` — project overview, architecture, domain map, graph-derived priorities
2. `.specd/specd-bootstrap-analisys.md` — full graph analysis report (hotspots, impact, coverage gaps)
3. A specd change containing all identified spec targets, with a rich `.specd-exploration.md`
   that captures everything discovered — so `/specd-design` can generate schema-compliant
   specs without any additional discovery work

## When to run

- When adding specd to an existing project for the first time
- When specd has no specs and no metadata yet

**Never invoke automatically.** Only runs when the user explicitly calls `/specd-bootstrap`.

---

## Steps

If no `project-root` was provided as argument, ask the user for it before proceeding.

Warn the user: this is expensive. It reads source, tests, schemas, API definitions, migrations, and CI config. It also indexes and queries the code graph.

### Step 0 — Create progress tasks

Create these tasks before doing any other work:

- "Explore structure" (activeForm: "Exploring repository structure")
- "Index and analyse code graph" (activeForm: "Indexing and analysing code graph")
- "Read documentation" (activeForm: "Reading documentation and config")
- "Read schemas and APIs" (activeForm: "Reading data models and API definitions")
- "Read CI and env config" (activeForm: "Reading CI/CD and environment config")
- "Identify domains and spec targets" (activeForm: "Identifying domains and spec targets")
- "Analyse domains" (activeForm: "Analysing domain source files and tests")
- "Write graph analysis report" (activeForm: "Writing graph analysis report")
- "Write specd-bootstrap.md" (activeForm: "Writing bootstrap overview")
- "Propose spec hierarchy" (activeForm: "Proposing spec hierarchy")
- "Ask user: create change?" (activeForm: "Waiting for user confirmation")
- "Create change" (activeForm: "Creating specd change")
- "Write exploration file" (activeForm: "Writing exploration context")

Mark each in_progress when you start it and completed when done.

### Step 1 — Explore structure

Mark "Explore structure" in_progress.

Map the full repository structure:

- Monorepo or single package? If monorepo, list all packages/workspaces.
- Language, runtime, package manager, build tool, test framework
- Top-level source directories and their apparent purpose
- Test directories and naming pattern (_.spec.ts, __test.go, test_\*.py, etc.)
- Existing docs, ADRs, architecture decision records
- Architectural pattern signals: look for domain/, application/, infrastructure/,
  adapters/, ports/, controllers/, services/, repositories/, usecases/, handlers/,
  events/, commands/, queries/. Identify: hexagonal/ports-and-adapters, layered,
  clean architecture, MVC, CQRS, event-sourcing, microservices, modular monolith.
- Event-driven signals: events/, handlers/, subscribers/, publishers/, message queues.

Mark "Explore structure" completed.

### Step 1b — Index and analyse code graph

Mark "Index and analyse code graph" in_progress.

If specd CLI is available, use the code graph. If not, skip this step.

**Index the graph** (if not already indexed or stale):

```bash
specd graph index --format json
```

**Collect graph stats:**

```bash
specd graph stats --format json
```

Store: total files, symbols, specs, relations, languages, last indexed date.

**Run hotspot analysis:**

```bash
specd graph hotspots --limit 50 --min-risk LOW --exclude-path "*:test/*" --format json
```

For each workspace/package:

```bash
specd graph hotspots --workspace <name> --limit 30 --min-risk MEDIUM --exclude-path "*:test/*" --format json
```

**Run impact analysis** on the top 5-10 highest-score hotspots:

```bash
specd graph impact --symbol "<name>" --direction downstream --depth 2 --format json
```

**Collect and store:**

- All CRITICAL and HIGH risk symbols with their scores, kinds, files, and dependents
- Symbols grouped by architectural layer
- Symbols with zero or few tests relative to their impact
- Cross-workspace dependencies (XWS > 0 symbols)

Mark "Index and analyse code graph" completed.

### Step 2 — Read documentation

Mark "Read documentation" in_progress.

Read if present:

- README.md, ARCHITECTURE.md, CONTRIBUTING.md, DESIGN.md, AGENTS.md, CLAUDE.md
- .github/copilot-instructions.md, docs/ directory (up to 10 files)
- Root package manifest (package.json, Cargo.toml, pyproject.toml, go.mod)
- Any existing specd.yaml or .specd/ directory contents
- ADR files (docs/adr/, docs/decisions/, .decisions/)
- Up to 8 representative source files from the core domain (not tests, not config)
- CHANGELOG.md or HISTORY.md

Mark "Read documentation" completed.

### Step 3 — Read schemas and APIs

Mark "Read schemas and APIs" in_progress.

Read if present:

**Data model definitions:**

- ORM schemas: Prisma (schema.prisma), TypeORM (_.entity.ts), Sequelize (_.model.ts),
  Django (models.py), SQLAlchemy (models.py), ActiveRecord (app/models/), GORM (models/)
- MongoDB/ODM schemas: Mongoose (\*.schema.ts), MongoEngine (models.py)
- SQL migrations: migrations/, db/migrate/, src/migrations/, alembic/
- Drizzle, Kysely, or other query builder schema files
- Any \*.sql files that define tables or constraints
- Protobuf message definitions (\*.proto)

**API definitions:**

- OpenAPI / Swagger (openapi.yaml, swagger.yaml, api.yaml, docs/api/)
- Protocol Buffers (_.proto), GraphQL schemas (_.graphql, \*.gql)
- tRPC / gRPC service definitions
- FastAPI/Flask route decorators, Spring @RestController, Go handler registrations
- Rails routes.rb, Django urls.py

**Event / message schemas:**

- Event type definitions: events/, _.event.ts, _\_event.py, \*Event.java, etc.
- Message schema files (Avro, JSON Schema, Protobuf), AsyncAPI specs
- Kafka/RabbitMQ/SQS/SNS consumer/producer configurations

Mark "Read schemas and APIs" completed.

### Step 4 — Read CI, env config, and tooling

Mark "Read CI and env config" in_progress.

Read if present:

- .github/workflows/\*.yml
- .env.example, .env.template
- docker-compose.yml, Dockerfile
- Any config/ directory with app configuration schemas
- Linter/formatter config: eslint.config._, .eslintrc._, .prettierrc, rustfmt.toml,
  .rubocop.yml, .flake8, pyproject.toml [tool.ruff], .golangci.yml
- Test config: jest.config._, vitest.config._, pytest.ini, conftest.py, .rspec
- Compiler/type config: tsconfig.json, mypy.ini, pyright, Cargo.toml, go.mod

Extract: required env vars, external service dependencies, quality gates,
deployment constraints, enforced code style rules.

Mark "Read CI and env config" completed.

### Step 4b — Read recent git history

```bash
git -C <project-root> log --oneline -50
```

Analyse the last 50 commits:

- Which directories/domains are most actively changed
- Commit message patterns → detect commit style
- Recent refactors or renames → signals domain boundaries that may have shifted
- Commits mentioning "breaking change", "invariant", "constraint", "fix"

Store observations in memory. Do not write to disk.

### Step 5 — Identify domains and spec targets

Mark "Identify domains and spec targets" in_progress.

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

- File naming, import style, commit format, test location, error handling pattern.

**Event catalog (if event-driven):**

- All named event types found, their payloads, producers and consumers.

**Spec targets — what needs a spec:**

Every specifiable code construct MUST be proposed as a spec target. Scan the entire
codebase and catalogue every instance of the following constructs (apply only the
column matching the detected architecture):

| Code construct                       | Hexagonal / Clean | Layered (N-tier) | MVC | CQRS / Event-driven | Modular monolith  | Microservices      |
| ------------------------------------ | ----------------- | ---------------- | --- | ------------------- | ----------------- | ------------------ |
| Domain entities / models             | Yes               | Yes              | Yes | Yes (aggregates)    | Yes               | Yes                |
| Value objects                        | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Domain services                      | Yes               | Yes              | —   | Yes                 | Yes               | Yes                |
| Ports / interfaces / contracts       | Yes               | Yes              | —   | Yes (bus contracts) | Yes (module APIs) | Yes (service APIs) |
| Use cases / application services     | Yes               | Yes              | —   | Yes (handlers)      | Yes               | Yes                |
| Repositories                         | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Controllers / handlers / entrypoints | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| CLI commands                         | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| API endpoints (REST/gRPC/GraphQL)    | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Events / commands / queries          | —                 | —                | —   | Yes (all)           | If present        | If present         |
| Infrastructure adapters              | Yes               | Yes              | —   | Yes                 | Yes               | Yes                |
| Middleware / guards / interceptors   | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Schemas / data models                | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| State machines / workflows           | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Configuration models                 | Yes               | Yes              | Yes | Yes                 | Yes               | Yes                |
| Error types / error model            | Yes               | Yes              | —   | Yes                 | Yes               | Yes                |
| Composition / wiring / DI modules    | Yes               | —                | —   | Yes                 | Yes               | Yes                |

For each construct found, record: name, kind, file path, domain, whether it already has a spec.

If graph data is available from Step 1b:

1. Enrich each item with hotspot score, risk level, dependents, XWS, test coverage.
2. Add CRITICAL/HIGH-risk hotspots not already in the catalogue.
3. Sort into priority tiers: **1** CRITICAL/HIGH, **2** MEDIUM, **3** LOW/no graph data.

If no graph data, sort alphabetically by domain then by kind.

**One construct = one spec.** Every entity, value object, model, controller, use case,
port, command, event, repository, etc. gets its own individual spec. Do not bundle.

Store the full catalogue — it feeds the analysis report (Step 7) and the change
creation (Steps 10-12).

Mark "Identify domains and spec targets" completed.

### Step 5b — Propose spec hierarchy

Mark "Propose spec hierarchy" in_progress.

**STOP HERE.** Before going deeper, propose how the specs should be organized and
get the user's approval. The hierarchy determines all spec paths used in
`change create` — changing it later would require renaming everything.

**Bootstrap operates on the default workspace only.** All spec IDs use the format
`<default-workspace>:<path>`. Determine the default workspace name from `specd.yaml`
(or use `default` if no config exists yet).

If the project is a monorepo that would benefit from multiple workspaces, do NOT
configure them during bootstrap. Flag it clearly:

> ⚠️ This project looks like a monorepo. Bootstrap will use the default workspace.
> If you want per-package workspaces (e.g. `core:`, `cli:`), configure them in
> `specd.yaml` first and re-run bootstrap.

**Choose the option that best fits** (or propose a hybrid):

**Option A — Flat by domain** (best for small/medium projects)

```
<domain>/<spec-name>
```

Examples: `change`, `spec`, `schema-show`, `graph-hotspots`

**Option B — Domain with sub-grouping** (best for medium/large projects)

```
<domain>/<sub-domain>/<spec-name>
```

Examples: `change/entity`, `change/events`, `spec/loader`, `spec/merger`

**Option C — Layer / domain** (best for strict layered or hexagonal architectures)

```
<layer>/<domain>/<spec-name>
```

Examples: `domain/change`, `application/list-changes`, `infrastructure/fs-adapter`

**Option D — Package path** (best for monorepos using default workspace)

```
<package>/<spec-name>
```

Examples: `core/change`, `cli/schema-show`

Apply the chosen option to the FULL catalogue from Step 5 and present to the user:

> **Proposed spec hierarchy: Option <X> — <name>**
>
> Based on the detected architecture (<pattern>), I propose:
> `<default-workspace>:<pattern>`
>
> This gives <N> spec paths:
>
> - `<default-workspace>:<path>` — covers <constructs>
> - ...
>
> **Does this structure work for you, or would you like to adjust it?**

Wait for the user's response:

- **Confirmed** → store the approved spec path list, proceed to Step 6
- **Modified** → apply adjustments, show updated list, confirm again
- **Custom pattern** → apply it to all spec targets, show result, confirm

Store the final approved spec path mapping — it will be used verbatim in `change create`.

Mark "Propose spec hierarchy" completed.

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

- Auth checks, authorization / permission model, sensitive fields, input validation

**Performance constraints (per domain):**

- Rate limiting, pagination patterns, timeouts, caching

**Dependency graph:**

- For each domain, which other domains it imports from (informs Spec Dependencies)

**Test coverage gaps:**

- Domains with no test files → requirements are [inferred] only, flag prominently

**Confidence tracking** — for each extracted requirement, note its source:
`[docs]`, `[test]`, `[code]`, `[schema]`, `[security]`, `[inferred]`

Mark "Analyse domains" completed.

### Step 7 — Write graph analysis report

Mark "Write graph analysis report" in_progress.

If graph data was collected in Step 1b, write `.specd/specd-bootstrap-analisys.md`:

```
> ⚠️ DRAFT — Generated by specd bootstrap. Graph data is a snapshot at indexing time.

# Code Graph Analysis & Missing Specs Report

> Generated: <date>
> Graph indexed: <last indexed date from stats>

## Graph Statistics
<Table: files, symbols, specs, languages, relation counts>

## Impact Analysis
<For each symbol analysed: name, kind, file, risk level, dependents, layer>

## Hotspots by Package/Workspace
<Table per workspace: Score, Risk, XWS, Kind, Name, File>

## Spec Targets by Architecture

Detected architecture: <pattern>

| Code construct | Relevant? | Instances found | Already specced | Missing spec |
...

## Full Spec Catalogue
<Every specifiable construct grouped by domain, one row per construct>

## Proposed Specs — Prioritised

### Priority 1: CRITICAL/HIGH risk
<Table: spec path, workspace, constructs, hotspot score, risk level>

### Priority 2: MEDIUM risk
### Priority 3: LOW risk / no graph data
### Already covered (no action needed)

## Test Coverage Gaps
<Modules with high hotspot scores but zero test files>
```

If no graph data was collected, skip this step entirely.

Mark "Write graph analysis report" completed.

### Step 8 — Write specd-bootstrap.md

Mark "Write specd-bootstrap.md" in_progress.

Write `<project-root>/specd-bootstrap.md`:

```
# specd Bootstrap — <project name>

> Generated by specd bootstrap. Review and refine before use.

## Project overview
<2–3 sentences>

## Tech stack
- **Language**: ...
- **Runtime**: ...
- **Package manager**: ...
- **Build**: ...
- **Test**: ...
- **Key deps**: ...
- **Event transport**: ... (omit if not event-driven)

## Architecture
**Pattern**: <hexagonal / layered / clean / MVC / CQRS / event-sourcing / mixed / unclear>
<2–3 sentences>

## Repository structure
<monorepo/single + one line per package or top-level dir>

## Domain map
<One line per domain: name → what it does, which layer>

## Cross-cutting concerns
<Auth, observability, error handling, validation approach>

## Security model
<Auth/authorization, sensitive data categories. Omit if nothing concrete found.>

## Performance constraints
<Rate limits, pagination, timeouts, caching. Omit if nothing concrete found.>

## Most active domains (from git history)
<Top 3–5 domains by commit frequency in the last 50 commits>

## Graph-derived spec priorities
<If graph available:
  Graph stats: <files> files, <symbols> symbols, <relations> relations
  Top 5 highest-risk unspecced modules: ...
  See .specd/specd-bootstrap-analisys.md for full analysis.
  Omit if no graph data.>

## Event catalog
<If event-driven: event types, producers/consumers. Omit otherwise.>

## Environment dependencies
<Required env vars and external services>

## Conventions detected
- <file naming>
- <import style>
- <commit format>
- <test location>
- <error handling>

## Generated files

**Analysis:**
- specd-bootstrap.md (this file)
- .specd/specd-bootstrap-analisys.md (if graph was available)

**Change:**
- <changePath>/ — specd change with all spec targets
- <changePath>/.specd-exploration.md — full discovery context

To generate the spec artifacts:
1. Run `/specd-design bootstrap-<project-name>`
2. Review generated specs — they are schema-compliant drafts
3. Run `/specd-verify bootstrap-<project-name>` to validate
4. Run `/specd-archive bootstrap-<project-name>` to promote to `specs/`
```

Mark "Write specd-bootstrap.md" completed.

### Step 9 — Checkpoint: ask user before creating the change

**STOP HERE and present a summary to the user.**

1. Files already generated: `specd-bootstrap.md`, `.specd/specd-bootstrap-analisys.md` (if available)
2. What happens next: a specd change is created with ALL approved spec targets and a rich
   `.specd-exploration.md`. The user then runs `/specd-design` to generate the actual artifacts.
3. Scope summary: domains, global specs, total spec targets. Point to `.specd/specd-bootstrap-analisys.md`.
4. Ask: **"Do you want me to create the specd change? You can also limit scope — e.g. only Priority 1 targets, or specific domains."**

Possible outcomes:

- **"yes" / "all"** → create the change with all spec targets (Steps 10-12)
- **"priority 1 only"** → include only Priority 1 spec targets
- **specific domains** → include only the named domains
- **"no"** → stop here

### Step 10 — Create the specd change (conditional)

Only execute if the user confirmed in Step 9.

Mark "Create change" in_progress.

**Determine the change name:** `bootstrap-<project-name>` in kebab-case.

**Verify the default workspace** is `owned` (not `readOnly`):

```bash
specd config show --format json
```

If `readOnly`, stop and tell the user — bootstrap cannot create specs in a read-only workspace.

**Determine spec IDs** from the approved mapping in Step 5b (`<default-workspace>:<path>`).

Cross-reference with existing specs to avoid duplicates:

```bash
specd spec list --format text --summary
```

**Create the change:**

```bash
specd change create bootstrap-<project-name> \
  --spec <workspace:path> \
  --spec <workspace:path> \
  ... \
  --description "Bootstrap specs for <project-name> — generated by specd bootstrap" \
  --format json
```

Store the `changePath` from the response.

If `change create` fails with `Change '<name>' already exists`, load its status and redirect:

```bash
specd change status bootstrap-<project-name> --format json
```

| State                            | Suggest                                     |
| -------------------------------- | ------------------------------------------- |
| `drafting` / `designing`         | `/specd-design bootstrap-<project-name>`    |
| `ready`                          | `/specd-implement bootstrap-<project-name>` |
| `implementing` / `spec-approved` | `/specd-implement bootstrap-<project-name>` |
| `verifying`                      | `/specd-verify bootstrap-<project-name>`    |
| `done` / `signed-off`            | `/specd-verify bootstrap-<project-name>`    |
| `archivable`                     | `/specd-archive bootstrap-<project-name>`   |

**Stop — do not continue.**

Run entry hooks:

```bash
specd change run-hooks bootstrap-<project-name> drafting --phase pre
specd change hook-instruction bootstrap-<project-name> drafting --phase pre --format text
```

Follow any guidance returned.

Mark "Create change" completed.

### Step 11 — Register spec dependencies (conditional)

Only execute if the user confirmed in Step 9.

From the dependency graph built in Step 6, register known dependencies:

```bash
specd change deps bootstrap-<project-name> <specId> --add <depId>
```

Register only clearly identified dependencies. Skip speculative or uncertain ones.

### Step 12 — Write exploration file (conditional)

Only execute if the user confirmed in Step 9.

Mark "Write exploration file" in_progress.

Use the `changePath` returned by `change create` in Step 10.

Write `<changePath>/.specd-exploration.md`. This is the primary handoff document for
`/specd-design` — it replaces the discovery conversation that `specd-new` would have
with the user. Everything discovered during the bootstrap analysis goes here.

Structure:

```markdown
# Bootstrap Exploration — <project name>

Generated: <YYYY-MM-DD>
Change: bootstrap-<project-name>

## Project overview

<2-3 sentences>

## Architecture

**Pattern**: <detected pattern>
<Brief description of layers and structure>

## Domain map

<One entry per domain: name, source paths, architectural layer, 1-line description>

## Spec targets in this change

Priority order for /specd-design to follow (Priority 1 first):

### Priority 1 — CRITICAL/HIGH risk

<spec ID — constructs — why it matters>

### Priority 2 — MEDIUM risk

<spec ID — constructs>

### Priority 3 — LOW risk / no graph data

<spec ID — constructs>

## Domain analysis

### <Domain name>

**Source paths**: <list>
**Test paths**: <list>
**Entities and types**: <names, kinds, key fields>
**State machines**: <states and transitions>
**Validation logic**: <invariants, preconditions, postconditions>
**Public API surface**: <exported functions/methods and signatures>
**Error types**: <names and when thrown>
**Security model**: <auth checks, permission model, sensitive fields>
**Performance constraints**: <rate limits, pagination, timeouts, caching>
**Dependencies on other domains**: <which domains this one imports from>
**Test coverage**: <present/absent/partial — key test descriptions found>

**Requirements extracted** (with confidence source):

- [source] Requirement description

## Global specs

### \_global/architecture

<Full architecture analysis: pattern, layers, rules to enforce>

### \_global/conventions

<All detected conventions: naming, imports, commits, test location, error handling, CI gates>

## Cross-cutting concerns

<Auth mechanism, permission model, observability, error handling>

## Spec dependencies

<Map of spec → depends on spec>

## Open questions

<Anything uncertain for /specd-design to flag as [inferred]>

## Key codebase observations

<Relevant file paths, existing patterns, current behavior>

## Graph data summary

<If graph available: top hotspots, risk levels, XWS, test gaps.
Reference .specd/specd-bootstrap-analisys.md for full data.>
```

**Completeness is mandatory.** Everything found in Steps 1–7 relevant to writing a spec
for any target in this change MUST be captured here. `/specd-design` will not re-read
the codebase — it will rely entirely on this file.

Mark "Write exploration file" completed.

Run exit hooks:

```bash
specd change run-hooks bootstrap-<project-name> drafting --phase post
specd change hook-instruction bootstrap-<project-name> drafting --phase post --format text
```

Follow any guidance returned.

**Show status and stop:**

```bash
specd change status bootstrap-<project-name> --format json
```

> Change `bootstrap-<project-name>` created at `<changePath>`.
> Run `/specd-design bootstrap-<project-name>` to generate the spec artifacts.

**Stop here.** Do not write any spec artifacts.

## Notes

- Never invent — only document what you found in source, tests, schemas, docs, or graph data
- If a constraint is uncertain, tag it TODO and note the source
- State machine transitions are normative — always include them
- Requirements tagged [inferred] need the most human review
- Omit sections that have nothing real to say — do not fill with guesses
- The event catalog and data model sections are high value — prioritise them if present
- Graph hotspots are the primary signals for spec prioritisation
- If specd CLI or graph commands are not available, all graph-related steps are optional
- The spec targets table is architecture-dependent — apply only the column matching
  the detected pattern. For mixed architectures, combine relevant columns.
