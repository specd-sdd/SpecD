# spec suggest

Discover candidate specifications and detect specification coverage gaps across the codebase using graph analysis and capability clustering.

## Usage

```bash
specd specs suggest [options]
specd spec suggest [options]
```

### Options

| Option | Description |
|---|---|
| `--ignore-current-specs` | Ignore existing specs on disk and execute full brownfield capability discovery across all source files. |
| `-w, --workspace <name>` | Restrict specification suggestion and gap analysis to a single workspace. |
| `-m, --min-confidence <0.0-1.0>` | Filter candidate specifications by minimum confidence threshold. |
| `-l, --limit <n>` | Limit the number of displayed candidate specifications. |
| `--rebuild-cache` | Bypass and overwrite existing suggestion cache entries. |
| `--config <path>` | Path to `specd.yaml`. |
| `--format <text|json|toon>` | Output format (default: `text`). |
| `-j, --json` | Output machine-readable JSON representation (shorthand for `--format json`). |

## Rules

- **Code Graph Staleness Diagnostics**:
  - The command automatically inspects the freshness of the code graph before running analysis.
  - In text mode, if the index is out of date, an advisory warning is displayed recommending running `specd graph index`.
  - In JSON mode (`--json`), the payload includes a top-level `"codeGraphStale": true | false` field indicating whether the underlying graph index was stale during analysis.
- **Symbol-Level Granularity**:
  - Analysis operates strictly at the symbol level. If a single legacy file contains multiple distinct structural use cases or classes, each uncovered symbol is clustered into its own candidate specification, even if another symbol in the same file is already claimed by an existing specification.
- **Gap Analysis Mode** (default):
  - Audits existing specifications across all project workspaces to identify what code is already covered.
  - Warms up the implementation suggestions cache across workspaces, leveraging confirmed `HIGH` confidence links for existing specs.
  - Evaluates all specification artifacts (`spec.md`, `verify.md`, etc.) as a unified document.
  - Correlates declared symbols with the codebase to automatically claim related composition wiring, domain helpers, and storage adapters, ensuring only genuinely uncovered capabilities are reported.
- **Brownfield Discovery Mode** (`--ignore-current-specs`):
  - Evaluates all production source files from scratch and groups them into architectural capability clusters (Use Cases, Domain Entities, Ports, Infrastructure Adapters, Services, Public APIs).
  - Infers minimal inter-spec dependency hierarchies using transitive reduction.
  - Scores candidate specifications across 5 objective dimensions: caller evidence, architectural clarity, cohesion, public surface, and test alignment.

## Examples

```bash
# Audit specification gaps in the active project
specd specs suggest

# Run full brownfield capability discovery on a specific workspace
specd specs suggest --ignore-current-specs --workspace core

# Output machine-readable JSON for scripting or AI agent consumption
specd specs suggest --json --min-confidence 0.80 --limit 10
```
