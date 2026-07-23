# Spec Compliance Report — extract-fs-config-loader

**Mode:** change  
**Date:** 2026-07-23  
**Specs:** `core:config-loader`, `core:config`, `core:composition`, `default:_global/architecture`

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| Major    | 1     |
| Minor    | 1     |
| Info     | 1     |

Change goals (extract + drift alignment for `.specd/schemas`, `createDefaultConfigLoader`, absent-`metadataPath` ownership) are largely compliant. One pre-existing major gap remains on **explicit** `metadataPath` handling.

## Findings

### MAJOR-1 — Explicit `metadataPath` dropped for `fs` adapter

**Specs:** `core:config-loader` (Path resolution / Explicit metadataPath scenario), `core:config` (Workspaces metadataPath)

**Evidence:**

- `resolveAdapterBinding` resolves relative `metadataPath` when present (`config-loader.ts` ~171–174).
- For `type === 'fs'`, `normalizedConfig` is built with only `path` (+ optional `pattern`); resolved `metadataPath` is **not** copied (`config-loader.ts` ~183–193).
- Composition always overwrites `metadataPath` via `resolveMetadataPathForWorkspace` when constructing `SpecRepository` (`composition-resolver.ts` ~448–468), and that helper never reads an explicit adapter `metadataPath`.

**Interpretations:**

1. **Code bug** — specs/scenarios require explicit path resolution and use; code discards it.
2. **Spec overclaim** — product may intentionally always derive metadata roots; then specs/scenarios should drop “explicit resolve” claims.

**Tests:** No loader test asserts explicit `metadataPath` survives `load()` / reaches repositories.

### MINOR-1 — Purpose still names `createConfigLoader`

**Spec:** `core:config-loader` Purpose/Description still says `` `createConfigLoader` `` while Requirements/Constraints correctly say `createDefaultConfigLoader`.

**Interpretation:** leftover wording drift from the rename alignment; constraints/scenarios are correct.

### INFO-1 — Extract surface matches design

`config-schema.ts` (ports, no fs), `config-cascade.ts` (fs cascade), `FsConfigLoader` coordinator, `createDefaultConfigLoader` public factory, `.specd/schemas` default, and barrel excluding `FsConfigLoader` all match merged specs. Loader suite 124 + barrel checks green.

## Verification scenario rollup (this change)

| Area                                                  | Result                                                 |
| ----------------------------------------------------- | ------------------------------------------------------ |
| Factory / `createDefaultConfigLoader` / `resolvePath` | PASS                                                   |
| Discovery / forced / cascade / env / errors           | PASS (covered by tests)                                |
| Default `schemasPath` → `.specd/schemas`              | PASS                                                   |
| Absent `metadataPath` owned by composition            | PASS (derivation in `resolveMetadataPathForWorkspace`) |
| Explicit `metadataPath` after `load()`                | FAIL (MAJOR-1)                                         |
| Composition / architecture naming + public barrel     | PASS                                                   |

## Recommendation

Decide whether explicit `metadataPath` is required behaviour. If yes → fix loader + composition (+ tests). If no → narrow specs/verify. Optionally clean MINOR-1 Purpose wording in the same design pass.
