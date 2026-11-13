# Proposal: cli-input-dash-stdin

## Motivation

`project update-metadata` is misnamed and inconsistent: it only persists the single LLM-optimized project context string, yet looks like a generic metadata editor, and its content-input flags disagree with the rest of the CLI (`--file` + implicit stdin vs `--input` + `-`). Agents already expect a direct text flag that the CLI does not implement.

## Current behaviour

- CLI registers `project update-metadata` with `--file <path>` or default stdin; payload must be JSON/YAML `{ optimizedContext: "..." }` and delegates to `UpdateProjectMetadata`.
- Docs already mention `--input` while code still uses `--file`; the project-context-optimizer template calls `project update-metadata --optimized-context "..."` which is not a real flag.
- `project metadata` dumps the full `project-metadata.json` (optimized + freshness + generated).
- Specs already use a dedicated `specs optimizations get|set|clear` surface for two fields (`optimizedDescription`, `optimizedContext`). Project has only one field (`optimized.context`) and still uses the old update-metadata naming.

## Proposed solution

Replace the project mutation surface with a singular command group that names the one field it owns:

```
project optimized-context get
project optimized-context set [--input <path|-> | --text <string>]
project optimized-context clear
```

- `set`: exactly one of `--input` or `--text`; `--input -` reads stdin; no implicit stdin; content is the raw optimized-context string (not a JSON envelope).
- `get`: prints the persisted optimized context (and enough freshness to know if it is usable), via `GetProjectMetadata`.
- `clear`: removes the project optimization cache (delete `project-metadata.json`) via a new Core clear use case; idempotent if absent.
- Remove `project update-metadata` (no alias), following the `spec update-metadata` removal pattern.
- Keep `project metadata` as the full-file dump; clarify it is inspection-only and not the write path.
- Extract shared CLI `readInput(path)` (`-` → stdin) for reuse with `specs optimizations set`.
- Update only the source agent template `SPECD-AGENT.md.tpl` (+ template test). Generated `.claude/agents/*` refresh later with `project update`.

## Specs affected

### New specs

- `cli:project-optimized-context`: CLI group `project optimized-context get|set|clear`, input contract (`--input`/`-`/`--text`), removal of write responsibility from `update-metadata`, delegation to Kernel.
  - Depends on: `cli:entrypoint`, `core:update-project-metadata`, `core:project-metadata`, `core:clear-project-metadata`
- `core:clear-project-metadata`: Core use case that atomically deletes `project-metadata.json` (idempotent if missing).
  - Depends on: `core:project-metadata`

### Modified specs

- `cli:project-update-metadata`: mark **Removed**; agents must use `project optimized-context set` instead.
  - Depends on (added): none
  - Depends on (removed): `core:update-project-metadata`
- `cli:project-metadata`: clarify inspection-only full dump vs `project optimized-context` mutation/read of the optimized field.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- CLI: replace `packages/cli/src/commands/project/update-metadata.ts` with an `optimized-context` command module; register in `program.ts` (dependents: program/run — MEDIUM risk).
- CLI helpers: add `read-input.ts`; optionally refactor `spec/optimizations.ts` to use it.
- Core: add `ClearProjectMetadata` (+ factory/resolver/Kernel wiring/`public` exports). Reuse `UpdateProjectMetadata` / `GetProjectMetadata` for set/get.
- Skills: update `packages/skills/.../specd-project-context-optimizer/SPECD-AGENT.md.tpl` and `template-workflow.spec.ts` only.
- Docs: `docs/cli/project-update-metadata.md` → new `project-optimized-context` doc; update `docs/cli/project.md` / guide CLI index.

## Technical context

- Specs have two optimization fields → plural `optimizations` group is correct there. Project has one field → user rejected `project optimizations` in favour of `project optimized-context`.
- Content-input convention locked: always `--input <path|->`; never `--file` for payloads; never implicit stdin.
- Inline set flag: `--text` (avoid `set --optimized-context` redundancy).
- Template-only edits for agents; post-change `project update` regenerates installed agents.
- Schema/graph `--file` path selectors are out of scope.

## Open questions

_None — clear semantics (delete `project-metadata.json`), `--text` naming, template-only migration, and raw-string `--input` were settled for this proposal._
