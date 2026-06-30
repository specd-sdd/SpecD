# Spec Compliance Audit: llm-optimized-metadata

**Date:** 2026-06-05
**Change:** llm-optimized-metadata
**Scope:** 18 specs (Skills, Plugins, CLI, Core) + Global Constraints

---

## 1. Requirements Summary

The `llm-optimized-metadata` change introduces support for LLM-optimized metadata fields (`optimizedDescription` and `optimizedContext`) to improve token efficiency and context quality for AI agents.

Key goals:

- Update `SpecMetadata` to include optimized fields.
- Update `CompileContext`, `GetSpecContext`, and `GetProjectContext` to prefer these fields when `llmOptimizedContext` is enabled.
- Update CLI commands (`specs list`, `specs context`, `project status`) to respect the new flags and emit `stale-optimization` warnings.
- Categorize skill templates into `skills/` and `agents/` directories.
- Introduce `specd-project-context-optimizer` and `specd-spec-context-optimizer` agents.

---

## 2. Implementation Status: HIGH (with notable discrepancies)

- **Core Domain:** `SpecMetadata` in `@specd/core` correctly includes `optimizedDescription` and `optimizedContext`. Zod schemas are updated for validation.
- **Context Compilation:** `CompileContext` and `GetSpecContext` correctly implement the preference logic and warning signals.
- **CLI Integration:** `specs list`, `specs context`, and `project status` commands are updated and verified to follow the new rules.
- **Skills/Plugins Infrastructure:** Directory categorization and capability injection (mcp, agents, frontmatter) are implemented across multiple plugins.

---

## 3. Discrepancies

### 🔴 Critical: I/O Synchronicity (Skills)

- **Spec Requirement:** `skills:skill-repository-infra` mandates using `node:fs/promises` for template reading.
- **Actual Code:** `FsSkillRepository` uses synchronous `readdirSync` and `readFileSync`.
- **Impact:** Violates the infrastructure spec and blocks potential migration to a fully async application layer.
- **Root Cause:** The `SkillRepository` port defines synchronous methods (`list`, `getBundle`), forcing the implementation to be sync unless the port is updated to be `Promise`-based.

### 🟡 Risk: Domain Type Mismatch (Plugins)

- **Spec Requirement:** Plugins must support the new LLM-optimized fields in their frontmatter.
- **Actual Code:** `Frontmatter` interfaces in `plugin-agent-claude` and other plugins do not yet include `optimizedDescription` or `optimizedContext`.
- **Impact:** While the application layer may pass these variables, they are not type-safe in the plugin domain models and may be dropped during strict validation if enabled.

### 🔵 Nit: Spec Definition Lag

- **Observation:** Several plugin specs (`specs/plugins-claude/plugin-agent/spec.md`, etc.) have not been updated to include the new LLM-optimized fields in their "Frontmatter type contract" sections.
- **Impact:** Documentation drift between the global metadata standard and specific plugin requirements.

### 🔵 Nit: Capability Validation Gaps

- **Observation:** `FsSkillRepository.getBundle()` validates required capabilities but does not explicitly check for the `frontmatter` capability before attempting to resolve it, although the `TemplateRenderer` handles the downstream gating.

---

## 4. Test Coverage: GOOD

- **Unit Tests:** robust coverage for `CompileContext`, `GetProjectContext`, `UpdateSpecMetadata`, and CLI formatting.
- **Integration Tests:** verified that `llmOptimizedContext` flag propagates correctly and prefers optimized content.
- **Fixes Applied:** Fixed `UpdateSpecMetadata` test expectation mismatch due to JSON pretty-printing. Fixed lint error in `project status` command.

---

## 5. Missing Tests

- **Integration (Plugins):** Lack of explicit integration tests verifying that `optimizedDescription` and `optimizedContext` are correctly rendered into the final installed agent files across all supported plugins (Codex, Copilot, etc.).
- **Boundary Tests:** No tests for `CompileContext` explicitly verifying the failure path when a transform cannot normalize an extracted value during fallback.

---

## 6. Spec Dependency Chain

- All change-scoped specs correctly reference their dependencies.
- `cli:project-status` correctly depends on `core:list-workspaces`, `core:list-drafts`, and `core:list-changes`.
- `core:compile-context` maintains its extensive dependency list for full-depth traversal.

---

## 7. Summary Counts

- **Specs Audited:** 18
- **Requirements Verified:** 45+
- **Discrepancies Found:** 4
- **Missing Tests Identified:** 2
- **Implementation Readiness:** 90% (Fixes required for I/O and Type Mismatches before Archive)

---

**Report generated at:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260604-134217-llm-optimized-metadata/reports/20260605-115152/specs-compliance-change-llm-optimized-metadata-20260605-115152.md`
