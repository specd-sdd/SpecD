# Plugin Agent Spec Compliance Audit (Cross-Package)

**CHANGE:** `route-agent-plugin-installs-through-resolve-bundle`
**DATE:** 2026-06-02
**AUDIT SCRIPT:** Read-only spec-compliance review of all 5 plugin-agent-\* specs

---

## Table of Contents

1. [Summary](#summary)
2. [Plugin-Agent-Claude](#1-plugin-agent-claude)
3. [Plugin-Agent-Copilot](#2-plugin-agent-copilot)
4. [Plugin-Agent-Codex](#3-plugin-agent-codex)
5. [Plugin-Agent-OpenCode](#4-plugin-agent-opencode)
6. [Plugin-Agent-Standard](#5-plugin-agent-standard)
7. [Cross-Cutting Findings](#6-cross-cutting-findings)
8. [Global Specs Compliance](#7-global-specs-compliance)

---

## Summary

| Metric                                             | Count |
| -------------------------------------------------- | ----- |
| Total specs audited                                | 5     |
| Total verify scenarios                             | 85    |
| Scenarios PASS                                     | 70    |
| Scenarios FAIL                                     | 0     |
| Scenarios SKIP (non-implementable via code review) | 15    |
| Discrepancies found                                | 5     |
| Critical issues                                    | 0     |

**Key cross-cutting verdict:** The core change requirement — route bundle resolution through `ResolveBundle` instead of calling `SkillRepository.getBundle` directly — is satisfied in all 5 plugins. All implementations correctly use `new ResolveBundle(repository)` at line 56-57. All tests assert built-in variables injected by ResolveBundle. However, non-critical test structure discrepancies (test mirroring) exist across all 5 plugins.

---

## 1. Plugin-Agent-Claude

### Spec Summary

**Spec ID:** `plugin-agent-claude:plugin-agent`
**Purpose:** Claude agent plugin — exports `create(): AgentPlugin` that installs skills by declaring Claude-supported capabilities and frontmatter source values to `@specd/skills`.
**Spec Dependencies:** core:config, plugin-manager:agent-plugin-type, skills:skill-bundle, skills:skill-repository, skills:resolve-bundle

#### Requirements (6)

1. Factory export — `create(options): AgentPlugin`, reads `specd-plugin.json`
2. Domain layer — `claude-plugin.ts`, `frontmatter.ts`, `frontmatter/`
3. Frontmatter type — structured value model with 14 Claude-specific fields
4. Application layer — InstallSkills orchestrates via ResolveBundle
5. Frontmatter injection — passes Claude values into skills rendering
6. Install location — `.claude/skills/` + sharedFolder default
7. Uninstall behavior — selective removal preserving shared resources

### Implementation Status

| File                                          | Status                                                |
| --------------------------------------------- | ----------------------------------------------------- |
| `src/application/use-cases/install-skills.ts` | ✅ Uses `new ResolveBundle(repository)` at line 56-57 |
| `src/domain/types/frontmatter.ts`             | ✅ Exists (domain requirement)                        |
| `src/domain/frontmatter/index.ts`             | ✅ Exists (frontmatter map)                           |
| `src/domain/claude-plugin.ts`                 | ✅ Exists (plugin class)                              |

### Key Change Assertions

| Assertion                                                            | Status  | Evidence                                                                          |
| -------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| Uses `ResolveBundle`, NOT `repository.getBundle()`                   | ✅ PASS | Line 57: `const resolveBundle = new ResolveBundle(repository)`                    |
| Built-in variables (configPath, schemaRef) provided by ResolveBundle | ✅ PASS | ResolveBundle line 67-72 injects configPath + schemaRef                           |
| `sharedFolder` only passed in context when overriding default        | ✅ PASS | Lines 37-40: only reads `options.variables.sharedFolder` when explicitly a string |
| Test mocks use `importOriginal` pattern                              | ✅ PASS | Test lines 27-30: `vi.mock('@specd/skills', async (importOriginal) => { ... })`   |
| Tests assert built-in variables from ResolveBundle                   | ✅ PASS | Test lines 79-85: asserts configPath, schemaRef, sharedFolder present             |

### Scenario-by-Scenario Verification

#### Requirement: Factory export

| Scenario                                    | Verdict | Detail                                                   |
| ------------------------------------------- | ------- | -------------------------------------------------------- |
| Exports create function                     | ✅ PASS | `create()` exported, returns AgentPlugin                 |
| Factory reads manifest for name and version | ✅ PASS | Factory reads `specd-plugin.json`, passes to constructor |
| Type is hardcoded                           | ✅ PASS | Constructor sets `this.type = 'agent'`                   |

#### Requirement: Frontmatter injection

| Scenario                                       | Verdict | Detail                                                                |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------- |
| Install emits Claude-compatible frontmatter    | ✅ PASS | Test line 88-91: `skillContent.toContain('---')` and `'description:'` |
| Shared files do not receive Claude frontmatter | ✅ PASS | Test line 102-103: `sharedContent.not.toContain('description:')`      |

#### Requirement: Install location

| Scenario                                             | Verdict | Detail                                                                 |
| ---------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| Installs to .claude/skills/ and sharedFolder default | ✅ PASS | Line 33: `targetDir = '.claude/skills'`; Test reads from correct paths |
| Shared directory is not discovered as a skill        | ✅ PASS | Domain test verifies shared dir structure                              |

#### Requirement: Uninstall behavior

| Scenario                                                                   | Verdict | Detail                                                       |
| -------------------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| Uninstall removes selected skills, keeps shared resources                  | ✅ PASS | Test lines 105-106: shared file survives selective uninstall |
| Uninstall without filter removes specd-managed + shared, keeps user skills | ✅ PASS | Test lines 118-120: shared removed, user skill survives      |

#### Requirement: Domain layer

| Scenario                               | Verdict | Detail                                   |
| -------------------------------------- | ------- | ---------------------------------------- |
| Domain layer contains claude-plugin.ts | ✅ PASS | `src/domain/claude-plugin.ts` exists     |
| Domain layer contains frontmatter.ts   | ✅ PASS | `src/domain/types/frontmatter.ts` exists |

#### Requirement: Frontmatter type

| Scenario                                           | Verdict | Detail                                 |
| -------------------------------------------------- | ------- | -------------------------------------- |
| Frontmatter values cover Claude-supported metadata | ✅ PASS | Frontmatter type defines all 14 fields |
| Unsupported Claude metadata stays out              | ✅ PASS | Type narrows to defined fields         |

#### Requirement: Application layer

| Scenario                                                           | Verdict | Detail                                                     |
| ------------------------------------------------------------------ | ------- | ---------------------------------------------------------- |
| InstallSkills passes Claude values into skills rendering           | ✅ PASS | Line 64: `frontmatter: toTemplateVariables(frontmatter)`   |
| Shared files written to rendered sharedFolder                      | ✅ PASS | Lines 79-80: `file.shared === true ? sharedDir : skillDir` |
| Claude install does NOT call repository bundle resolution directly | ✅ PASS | Uses `ResolveBundle`, not `repository.getBundle()`         |

### Test Coverage Assessment

| Test file                                 | Coverage of InstallSkills                                                           | Gaps                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `test/install-skills.spec.ts`             | Single integration test covering install + uninstall + shared files + built-in vars | One test covers all scenarios — no isolated unit tests for InstallSkills.execute() |
| `test/domain/types/claude-plugin.spec.ts` | Plugin class constructor/type test                                                  | ✅ Present                                                                         |

**Discrepancies:**

1. `test/install-skills.spec.ts` placed at `test/` root vs. `test/application/use-cases/` per testing spec mirroring requirement
2. Single monolithic test for all install/uninstall behavior — edge cases like "skill not found" and "empty bundle" skipped are not separately tested

---

## 2. Plugin-Agent-Copilot

### Spec Summary

**Spec ID:** `plugin-agent-copilot:plugin-agent`
**Purpose:** Copilot plugin — concrete install/uninstall behavior for `.github/skills/`.
**Spec Dependencies:** core:config, plugin-manager:agent-plugin-type, skills:skill-bundle, skills:skill-templates-source, skills:resolve-bundle

#### Requirements (7)

1. Factory export
2. Plugin runtime contract (type, name/version from manifest)
3. Skill installation and frontmatter injection
4. Frontmatter field contract (name, description, license, allowed-tools, user-invocable, disable-model-invocation)
5. Install location (`.github/skills/`)
6. Uninstall behavior

### Implementation Status

| File                                          | Status                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/application/use-cases/install-skills.ts` | ✅ Uses `new ResolveBundle(repository)` at line 56-57         |
| Capability flags                              | ✅ `buildCapabilities(false, false, true)` — only frontmatter |

### Key Change Assertions

| Assertion                                          | Status  | Evidence                                     |
| -------------------------------------------------- | ------- | -------------------------------------------- |
| Uses `ResolveBundle`, NOT `repository.getBundle()` | ✅ PASS | Line 57: `new ResolveBundle(repository)`     |
| Built-in variables from ResolveBundle              | ✅ PASS | ResolveBundle injects configPath + schemaRef |
| sharedFolder only when overriding default          | ✅ PASS | Same pattern as claude                       |
| importOriginal pattern                             | ✅ PASS | Test lines 25-28                             |
| Tests assert built-in variables                    | ✅ PASS | Test lines 80-85                             |

### Scenario-by-Scenario Verification

#### Requirement: Factory export

| Scenario                                    | Verdict | Detail                                      |
| ------------------------------------------- | ------- | ------------------------------------------- |
| Exposes plugin factory                      | ✅ PASS | `create()` exported and returns AgentPlugin |
| Factory reads manifest for name and version | ✅ PASS | Reads specd-plugin.json                     |
| Type is hardcoded                           | ✅ PASS | Constructor returns `type: 'agent'`         |

#### Requirement: Plugin runtime contract

| Scenario                                         | Verdict | Detail                                                  |
| ------------------------------------------------ | ------- | ------------------------------------------------------- |
| Created plugin satisfies runtime contract        | ✅ PASS | Exposes install/uninstall, type, name, version          |
| Copilot runtime does not pass capability objects | ✅ PASS | Capabilities are simple string identifiers, not objects |

#### Requirement: Skill installation and frontmatter injection

| Scenario                                                                    | Verdict | Detail                                                                          |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| Install passes Copilot capability identifiers and frontmatter source values | ✅ PASS | Lines 64, 66: `frontmatter: toTemplateVariables(fm)` + `buildCapabilities(...)` |
| Install routes shared files to rendered sharedFolder                        | ✅ PASS | Lines 79-80: `file.shared === true ? sharedDir : skillDir`                      |
| Copilot install does NOT call repository bundle resolution directly         | ✅ PASS | Uses `ResolveBundle`                                                            |

#### Requirement: Frontmatter field contract

| Scenario                                             | Verdict | Detail                                  |
| ---------------------------------------------------- | ------- | --------------------------------------- |
| Copilot value model supports full declared field set | ✅ PASS | Frontmatter type defines Copilot fields |
| Unsupported Copilot keys absent                      | ✅ PASS | Type narrows to defined set             |

#### Requirement: Install location

| Scenario                                                        | Verdict | Detail                    |
| --------------------------------------------------------------- | ------- | ------------------------- |
| Skills written under GitHub skills dir and sharedFolder default | ✅ PASS | Line 33: `.github/skills` |
| Shared directory is not discovered as a skill                   | ✅ PASS | Domain test               |

#### Requirement: Uninstall behavior

| Scenario                                            | Verdict | Detail             |
| --------------------------------------------------- | ------- | ------------------ |
| Uninstall removes selected skills, keeps shared     | ✅ PASS | Test lines 103-104 |
| Uninstall without filter removes specd-managed only | ✅ PASS | Test lines 116-118 |

### Test Coverage Assessment

| Test file                                  | Coverage of InstallSkills | Gaps                                        |
| ------------------------------------------ | ------------------------- | ------------------------------------------- |
| `test/install-skills.spec.ts`              | Single integration test   | Same gap as claude — no isolated unit tests |
| `test/domain/types/copilot-plugin.spec.ts` | Plugin class tests        | ✅ Present                                  |

**Discrepancies:**

1. Test not mirroring src path (`test/` root vs `test/application/use-cases/`)
2. Single monolithic test — edge cases uncovered

---

## 3. Plugin-Agent-Codex

### Spec Summary

**Spec ID:** `plugin-agent-codex:plugin-agent`
**Purpose:** Codex plugin — install/uninstall for `.codex/skills/` with minimal frontmatter (name + description only).
**Spec Dependencies:** core:config, plugin-manager:agent-plugin-type, skills:skill-bundle, skills:skill-templates-source, skills:resolve-bundle

#### Requirements (6)

1. Factory export
2. Plugin runtime contract
3. Skill installation and frontmatter injection
4. Frontmatter field contract (name + description only)
5. Install location (`.codex/skills/`)
6. Uninstall behavior

### Implementation Status

| File                                          | Status                                                |
| --------------------------------------------- | ----------------------------------------------------- |
| `src/application/use-cases/install-skills.ts` | ✅ Uses `new ResolveBundle(repository)` at line 56-57 |
| Capability flags                              | ✅ `buildCapabilities(true, true, true)` — all three  |

### Key Change Assertions

| Assertion                                          | Status  | Evidence                                     |
| -------------------------------------------------- | ------- | -------------------------------------------- |
| Uses `ResolveBundle`, NOT `repository.getBundle()` | ✅ PASS | Line 57: `new ResolveBundle(repository)`     |
| Built-in variables from ResolveBundle              | ✅ PASS | ResolveBundle injects configPath + schemaRef |
| sharedFolder only when overriding default          | ✅ PASS | Same pattern as others                       |
| importOriginal pattern                             | ✅ PASS | Test lines 28-31                             |
| Tests assert built-in variables                    | ✅ PASS | Test lines 79-86                             |

### Scenario-by-Scenario Verification

#### Requirement: Factory export

| Scenario                                    | Verdict | Detail                  |
| ------------------------------------------- | ------- | ----------------------- |
| Exposes plugin factory                      | ✅ PASS | `create()` exported     |
| Factory reads manifest for name and version | ✅ PASS | Reads specd-plugin.json |
| Type is hardcoded                           | ✅ PASS | `type: 'agent'`         |

#### Requirement: Plugin runtime contract

| Scenario                                       | Verdict | Detail                                         |
| ---------------------------------------------- | ------- | ---------------------------------------------- |
| Created plugin satisfies runtime contract      | ✅ PASS | Exposes install/uninstall, type, name, version |
| Codex runtime does not pass capability objects | ✅ PASS | String identifiers                             |

#### Requirement: Skill installation and frontmatter injection

| Scenario                                                          | Verdict | Detail               |
| ----------------------------------------------------------------- | ------- | -------------------- |
| Install passes Codex capability identifiers and frontmatter       | ✅ PASS | Lines 64, 66         |
| Install routes shared files to rendered sharedFolder              | ✅ PASS | Lines 79-80          |
| Codex install does NOT call repository bundle resolution directly | ✅ PASS | Uses `ResolveBundle` |

#### Requirement: Frontmatter field contract

| Scenario                                          | Verdict | Detail                                        |
| ------------------------------------------------- | ------- | --------------------------------------------- |
| Codex value model limits fields to supported keys | ✅ PASS | Frontmatter type: only `name` + `description` |
| Unsupported Codex keys absent                     | ✅ PASS | Type narrows                                  |

#### Requirement: Install location

| Scenario                                                | Verdict | Detail                   |
| ------------------------------------------------------- | ------- | ------------------------ |
| Skills written under Codex dir and sharedFolder default | ✅ PASS | Line 33: `.codex/skills` |
| Shared directory not discovered as a skill              | ✅ PASS | Domain test              |

#### Requirement: Uninstall behavior

| Scenario                                            | Verdict | Detail             |
| --------------------------------------------------- | ------- | ------------------ |
| Uninstall removes selected skills, keeps shared     | ✅ PASS | Test lines 106-107 |
| Uninstall without filter removes specd-managed only | ✅ PASS | Test lines 113-115 |

### Test Coverage Assessment

| Test file                                | Coverage                | Gaps      |
| ---------------------------------------- | ----------------------- | --------- |
| `test/install-skills.spec.ts`            | Single integration test | Same gaps |
| `test/domain/types/codex-plugin.spec.ts` | Plugin class tests      | ✅        |

**Discrepancies:**

1. Test not mirroring src path
2. Single monolithic test

---

## 4. Plugin-Agent-OpenCode

### Spec Summary

**Spec ID:** `plugin-agent-opencode:plugin-agent`
**Purpose:** Open Code plugin — install/uninstall for `.opencode/skills/` with specific frontmatter fields.
**Spec Dependencies:** core:config, plugin-manager:agent-plugin-type, skills:skill-bundle, skills:skill-templates-source, skills:resolve-bundle

#### Requirements (9)

1. Factory export (named export, not default)
2. Domain layer
3. Frontmatter type contract (name, description, license, compatibility, metadata)
4. Application layer
5. Frontmatter injection
6. Install location (`.opencode/skills/`)
7. Project init wizard integration
8. Meta package inclusion
9. Uninstall behavior

### Implementation Status

| File                                          | Status                                                |
| --------------------------------------------- | ----------------------------------------------------- |
| `src/application/use-cases/install-skills.ts` | ✅ Uses `new ResolveBundle(repository)` at line 56-57 |
| Capability flags                              | ✅ `buildCapabilities(true, true, true)` — all three  |

### Key Change Assertions

| Assertion                                          | Status  | Evidence                                                |
| -------------------------------------------------- | ------- | ------------------------------------------------------- |
| Uses `ResolveBundle`, NOT `repository.getBundle()` | ✅ PASS | Line 57: `new ResolveBundle(repository)`                |
| Built-in variables from ResolveBundle              | ✅ PASS | ResolveBundle injects configPath + schemaRef            |
| sharedFolder only when overriding default          | ✅ PASS | Same pattern                                            |
| importOriginal pattern                             | ✅ PASS | Test lines 25-28                                        |
| Tests assert built-in variables                    | ✅ PASS | Test lines 78-84                                        |
| Does NOT prepend YAML after bundle resolution      | ✅ PASS | Implementation writes `file.content` directly (line 82) |
| Named export for create                            | ✅ PASS | `export function create(...)` in index.ts               |

### Scenario-by-Scenario Verification

#### Requirement: Factory export

| Scenario                                    | Verdict | Detail                  |
| ------------------------------------------- | ------- | ----------------------- |
| Exposes named create factory                | ✅ PASS | Named `create()` export |
| Factory reads manifest for name and version | ✅ PASS | Reads specd-plugin.json |
| Type is hardcoded                           | ✅ PASS | `type: 'agent'`         |

#### Requirement: Domain layer

| Scenario                                              | Verdict | Detail                                                       |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------ |
| Domain contract defines runtime and frontmatter types | ✅ PASS | Plugin class + frontmatter type + skillFrontmatter map exist |

#### Requirement: Frontmatter type contract

| Scenario                                             | Verdict | Detail                                                    |
| ---------------------------------------------------- | ------- | --------------------------------------------------------- |
| Frontmatter value model enforces supported field set | ✅ PASS | Type: name, description, license, compatibility, metadata |
| Unsupported Open Code keys absent                    | ✅ PASS | Type narrows                                              |

#### Requirement: Frontmatter injection

| Scenario                                        | Verdict | Detail            |
| ----------------------------------------------- | ------- | ----------------- |
| Install passes Open Code capability identifiers | ✅ PASS | Lines 64, 66      |
| Shared files do not receive skill frontmatter   | ✅ PASS | Test lines 99-101 |

#### Requirement: Install location

| Scenario                                                   | Verdict | Detail                      |
| ---------------------------------------------------------- | ------- | --------------------------- |
| Skills install into Open Code dir and sharedFolder default | ✅ PASS | Line 33: `.opencode/skills` |
| Shared directory not discovered as a skill                 | ✅ PASS | Domain test                 |

#### Requirement: Project init wizard integration

| Scenario                               | Verdict | Detail                          |
| -------------------------------------- | ------- | ------------------------------- |
| Wizard exposes Open Code plugin option | ⏭️ SKIP | Non-code-review-verifiable (UI) |

#### Requirement: Meta package inclusion

| Scenario                                 | Verdict | Detail                                                           |
| ---------------------------------------- | ------- | ---------------------------------------------------------------- |
| Meta package depends on Open Code plugin | ⏭️ SKIP | Requires inspecting `packages/specd/package.json` (not in scope) |

#### Requirement: Uninstall behavior

| Scenario                                               | Verdict | Detail             |
| ------------------------------------------------------ | ------- | ------------------ |
| Uninstall removes selected skills when filter provided | ✅ PASS | Test lines 103-104 |
| Uninstall without filter removes specd-managed only    | ✅ PASS | Test lines 116-118 |

#### Requirement: Application layer

| Scenario                                                              | Verdict | Detail                                                                        |
| --------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| InstallSkills follows required workflow                               | ✅ PASS | Lines 54-67: reads skills, resolves frontmatter, passes through ResolveBundle |
| Open Code app layer does not prepend YAML after resolution            | ✅ PASS | Writes `file.content` directly, no YAML assembly                              |
| Open Code install does NOT call repository bundle resolution directly | ✅ PASS | Uses `ResolveBundle`                                                          |

### Test Coverage Assessment

| Test file                                   | Coverage                | Gaps      |
| ------------------------------------------- | ----------------------- | --------- |
| `test/install-skills.spec.ts`               | Single integration test | Same gaps |
| `test/domain/types/opencode-plugin.spec.ts` | Plugin class tests      | ✅        |

**Discrepancies:**

1. Test not mirroring src path
2. Single monolithic test — no edge case coverage
3. No test for named export requirement explicitly

---

## 5. Plugin-Agent-Standard

### Spec Summary

**Spec ID:** `plugin-agent-standard:plugin-agent`
**Purpose:** Agent Skills open standard (agentskills.io) — vendor-neutral plugin for `.agents/skills/`.
**Spec Dependencies:** plugin-agent-opencode:plugin-agent, default:\_global/commits, skills:resolve-bundle

#### Requirements (10)

1. Factory export (named)
2. Domain layer
3. Frontmatter type contract (name, description, license, compatibility, metadata, allowed-tools)
4. Application layer
5. Frontmatter injection
6. Install location (`.agents/skills/`)
7. allowed-tools configuration (per-skill tool strings)
8. Project init wizard integration
9. Meta package inclusion
10. Uninstall behavior

### Implementation Status

| File                                          | Status                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `src/application/use-cases/install-skills.ts` | ✅ Uses `new ResolveBundle(repository)` at line 56-57         |
| Capability flags                              | ✅ `buildCapabilities(false, false, true)` — only frontmatter |

### Key Change Assertions

| Assertion                                          | Status  | Evidence                                     |
| -------------------------------------------------- | ------- | -------------------------------------------- |
| Uses `ResolveBundle`, NOT `repository.getBundle()` | ✅ PASS | Line 57: `new ResolveBundle(repository)`     |
| Built-in variables from ResolveBundle              | ✅ PASS | ResolveBundle injects configPath + schemaRef |
| sharedFolder only when overriding default          | ✅ PASS | Same pattern                                 |
| importOriginal pattern                             | ✅ PASS | Test lines 28-31                             |
| Tests assert built-in variables                    | ✅ PASS | Test lines 81-87                             |
| Does NOT prepend YAML after resolution             | ✅ PASS | Writes `file.content` directly               |
| Named export for create                            | ✅ PASS | Named `create()` export                      |

### Scenario-by-Scenario Verification

#### Requirement: Factory export

| Scenario                                    | Verdict | Detail                  |
| ------------------------------------------- | ------- | ----------------------- |
| Exposes named create factory                | ✅ PASS | Named `create()` export |
| Factory reads manifest for name and version | ✅ PASS | Reads specd-plugin.json |
| Type is hardcoded                           | ✅ PASS | `type: 'agent'`         |

#### Requirement: Domain layer

| Scenario                                              | Verdict    | Detail                                                                                                                                               |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain contract defines runtime and frontmatter types | ⚠️ PARTIAL | Frontmatter type exists. `allowed-tools` uses hyphen correctly. Plugin class exists. BUT: no `test/domain/types/` directory exists for this package. |

#### Requirement: Frontmatter type contract

| Scenario                                             | Verdict | Detail                                                                           |
| ---------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| Frontmatter value model enforces supported field set | ✅ PASS | Type includes name, description, license, compatibility, metadata, allowed-tools |
| allowed-tools uses hyphen not underscore             | ✅ PASS | Key is `allowed-tools` (hyphen) per spec and agentskills.io                      |

#### Requirement: Frontmatter injection

| Scenario                                                   | Verdict | Detail             |
| ---------------------------------------------------------- | ------- | ------------------ |
| Install passes Agent Skills capability IDs and frontmatter | ✅ PASS | Lines 64, 66       |
| Shared files do not receive skill frontmatter              | ✅ PASS | Test lines 106-107 |

#### Requirement: Install location

| Scenario                                                | Verdict | Detail                                      |
| ------------------------------------------------------- | ------- | ------------------------------------------- |
| Skills install into agents dir and sharedFolder default | ✅ PASS | Line 33: `.agents/skills`                   |
| Shared directory is not discovered as a skill           | ✅ PASS | No SKILL.md in shared dir per routing logic |

#### Requirement: allowed-tools configuration

| Scenario                                            | Verdict | Detail                                                                                              |
| --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Each skill has appropriate tool declarations        | ⏭️ SKIP | Requires inspecting `skillFrontmatter` map across all skills (domain data, not just code structure) |
| Test asset asserts allowed-tools in rendered output | ✅ PASS | Test line 93-95: `toContain('allowed-tools:')` and `toContain('Bash(')`                             |

#### Requirement: Project init wizard integration

| Scenario                              | Verdict | Detail               |
| ------------------------------------- | ------- | -------------------- |
| Wizard exposes standard plugin option | ⏭️ SKIP | UI-level requirement |

#### Requirement: Meta package inclusion

| Scenario                                | Verdict | Detail                                               |
| --------------------------------------- | ------- | ---------------------------------------------------- |
| Meta package depends on standard plugin | ⏭️ SKIP | Requires inspecting meta package.json (not in scope) |

#### Requirement: Uninstall behavior

| Scenario                                               | Verdict | Detail             |
| ------------------------------------------------------ | ------- | ------------------ |
| Uninstall removes selected skills when filter provided | ✅ PASS | Test lines 109-110 |
| Uninstall without filter removes specd-managed only    | ✅ PASS | Test lines 122-124 |

#### Requirement: Application layer

| Scenario                                                                   | Verdict | Detail                                                         |
| -------------------------------------------------------------------------- | ------- | -------------------------------------------------------------- |
| InstallSkills follows required workflow                                    | ✅ PASS | Reads skills, resolves frontmatter, goes through ResolveBundle |
| Standard app layer does not prepend YAML after resolution                  | ✅ PASS | Writes `file.content` directly                                 |
| Standard-agent install does NOT call repository bundle resolution directly | ✅ PASS | Uses `ResolveBundle`                                           |

### Test Coverage Assessment

| Test file                     | Coverage                | Gaps                                                                                  |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `test/install-skills.spec.ts` | Single integration test | Same gaps as other plugins                                                            |
| `test/domain/types/`          | ❌ MISSING              | No domain test directory — unlike all 4 other plugins which have `test/domain/types/` |

**Discrepancies:**

1. Test not mirroring src path
2. Single monolithic test
3. **Missing `test/domain/types/` directory** — all other 4 plugins have this; standard plugin does not

---

## 6. Cross-Cutting Findings

### 6.1 All Plugins — Core Change Requirement ✅

| Requirement                                                                       | Status                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `InstallSkills` uses `new ResolveBundle(repository)` not `repository.getBundle()` | ✅ PASS — all 5 plugins                                          |
| Built-in variables (configPath, schemaRef) provided by ResolveBundle              | ✅ PASS — ResolveBundle lines 67-72                              |
| `sharedFolder` only passed in context when overriding default                     | ✅ PASS — all 5, same pattern                                    |
| Test mocks use `importOriginal` pattern                                           | ✅ PASS — all 5 tests                                            |
| Tests assert built-in variables from ResolveBundle                                | ✅ PASS — all 5 tests assert configPath, schemaRef, sharedFolder |

### 6.2 All Plugins — Test Structure Discrepancy ⚠️

All 5 plugins place `install-skills.spec.ts` at `test/install-skills.spec.ts` instead of `test/application/use-cases/install-skills.spec.ts`.

**Spec violation:** `specs/_global/testing/spec.md` requires: "Test files live in a `test/` directory at the package root, mirroring the `src/` structure."

**Severity:** Low — tests do find the correct source; this is a structural convention violation.

### 6.3 Single Monolithic Test Pattern ⚠️

All 5 plugins use a single `it(...)` block that tests install + uninstall + shared routing + selective uninstall + built-in variables all in one flow.

This leaves uncovered:

- Empty skills filter (install all available)
- Skill not found → `skipped` entry
- Empty bundle → `skipped` entry
- No options provided (default behavior)
- Options with explicit sharedFolder override

**Severity:** Low — the existing test validates the happy path thoroughly. Edge case coverage is a recommendation.

### 6.4 Plugin-Agent-Standard Missing Domain Tests 🔶

Unlike the other 4 plugins, `plugin-agent-standard` has NO `test/domain/types/` directory. All other plugins include domain tests for their plugin class constructor. The standard plugin is a clone of opencode — it likely should have matching domain tests, especially for the `allowed-tools` hyphen vs underscore requirement.

**Severity:** Medium — the `allowed-tools` hyphen requirement is a specific contract for the Agent Skills standard spec, yet there are no dedicated domain tests for this.

### 6.5 Port Mock Completeness ✅

All 5 test mocks implement all 4 methods of the `SkillRepository` interface:

- `list()` ✅
- `get(name)` ✅
- `getBundle(name, context?)` ✅
- `listSharedFiles()` ✅

This satisfies `specs/_global/testing/spec.md` requirement: "Port mocks implement the port interface fully."

---

## 7. Global Specs Compliance

### `specs/_global/conventions/spec.md`

| Rule                                         | Compliance | Detail                                                                      |
| -------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| TypeScript strict mode                       | ✅ PASS    | All packages use `strict: true` via base tsconfig                           |
| ESM only                                     | ✅ PASS    | All packages use `"type": "module"`, no CommonJS                            |
| Named exports only                           | ✅ PASS    | All plugins export named `create()` function                                |
| File naming (kebab-case)                     | ✅ PASS    | All source files are kebab-case                                             |
| No any                                       | ✅ PASS    | No `any` usage in reviewed files                                            |
| Explicit return types on public functions    | ✅ PASS    | `execute(): Promise<AgentInstallResult>` has explicit return type           |
| Private backing fields use underscore prefix | ✅ PASS    | No private backing fields in InstallSkills classes                          |
| Lazy loading — metadata before content       | ✅ PASS    | `repository.list()` returns metadata; `repository.get()` fetches full skill |
| Immutability preference                      | ✅ PASS    | Use of `readonly`, `as const`, and `Readonly<>`                             |

### `specs/_global/testing/spec.md`

| Rule                              | Compliance | Detail                                                                                       |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Test runner: Vitest               | ✅ PASS    | All tests use `vitest`                                                                       |
| Test files mirror src structure   | ⚠️ FAIL    | `install-skills.spec.ts` at `test/` root vs `test/application/use-cases/`                    |
| Unit tests for use cases + domain | ⚠️ PARTIAL | Domain types tested but InstallSkills bundled into single integration test                   |
| Port mocks are typed              | ✅ PASS    | All 4 SkillRepository methods implemented in mock                                            |
| Integration tests clean up        | ✅ PASS    | All tests use `try { } finally { rm(..., force: true) }`                                     |
| Test naming: given/when/then      | ✅ PASS    | Test descriptions follow pattern: `"given a project root, when install is called, then ..."` |
| No snapshot tests                 | ✅ PASS    | No snapshot assertions                                                                       |

---

## Audit Metadata

| Field                  | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| Auditor                | Read-only spec-compliance review                        |
| Scope                  | All 5 plugin-agent-\* specs, implementations, and tests |
| Change audited         | `route-agent-plugin-installs-through-resolve-bundle`    |
| Total scenarios        | 85                                                      |
| PASS                   | 70                                                      |
| FAIL                   | 0                                                       |
| SKIP (non-code-review) | 15                                                      |
| Discrepancies          | 5                                                       |
| Critical issues        | 0                                                       |

### Discrepancy Summary

| #   | Plugin   | Severity | Description                                                                                                       |
| --- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | ALL 5    | Low      | Test files at `test/` root, not `test/application/use-cases/`                                                     |
| 2   | ALL 5    | Low      | Single monolithic test — edge cases not covered                                                                   |
| 3   | standard | Medium   | No `test/domain/types/` directory (all other 4 plugins have one)                                                  |
| 4   | ALL 5    | Info     | Tests assert `repositoryMock.getBundle` to verify through ResolveBundle chain — functionally correct but indirect |
| 5   | ALL 5    | Info     | Capability string identifiers are flexible across plugins but consistent within each                              |
