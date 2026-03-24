# specd shared notes

Read this file at the start of every specd skill invocation.

## Mental model

**Every change in specd goes through specs, even pure code changes.** There is no
"code-only" workflow. The model is:

1. **Specs define what the system should do** — they are requirements, not documentation
2. **Code implements what the specs say** — implementation writes code that satisfies specs
3. **Verification checks code against specs** — the schema defines acceptance criteria

If a change modifies code, there MUST be a spec that describes the expected behaviour.
If no spec exists, **create one as part of the change**. If an existing spec covers it,
add it to the change's specIds and write a delta (or `no-op` if unchanged).

A change may include specs that **already exist and don't need modification** — the spec
defines the behaviour and the change implements the code for it. Use `op: no-op` deltas.

## CLI

Use `node packages/cli/dist/index.js` for ALL commands. Never use bare `specd`.

## changePath

Every skill starts by running `change status <name> --format json`. The response
includes `lifecycle.changePath` — the absolute path to the change directory. **Always
extract and store this.** All artifacts (proposal.md, design.md, tasks.md, deltas/)
live there. Never guess the path.

## Spec IDs

**Always `workspace:capability-path`** (e.g. `core:core/config`, `cli:cli/spec-metadata`,
`default:_global/architecture`). Never use bare paths like `core/config`.

To find the correct ID:

```bash
node packages/cli/dist/index.js spec list --format text --summary
```

Use the IDs from the PATH column. For new specs that don't exist yet, **ask the user**
which workspace they belong to.

## Reading specs

**Always use the CLI.** Never guess filesystem paths.

- Discover: `spec list --format text --summary`
- Read content: `spec show <specId> --format json`
- Read metadata: `spec metadata <specId> --format json`

## Hooks

Every workflow step has pre and post hooks. The pattern is always:

1. **On entry:** `change hook-instruction <name> <step> --phase pre --format text` → follow guidance
2. **On exit:** `change run-hooks <name> <step> --phase post` → then `change hook-instruction <name> <step> --phase post --format text` → follow guidance

Execute hooks for every state the change passes through, including intermediate ones
(`pending-spec-approval`, `spec-approved`, `done`, `pending-signoff`, `signed-off`, `archivable`).
