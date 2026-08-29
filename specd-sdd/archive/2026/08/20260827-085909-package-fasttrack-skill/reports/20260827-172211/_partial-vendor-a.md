# Vendor adapters audit — Claude, Copilot, and Codex

## Requirements Summary

Audited the rendered change previews for `plugin-agent-claude:plugin-agent`, `plugin-agent-copilot:plugin-agent`, and `plugin-agent-codex:plugin-agent`, with the common `default:_global/testing` contract and the adapters' declared `skills:*` dependencies in scope.

For this change, each adapter must include `specd-fasttrack` in a default (unfiltered) standard-skill installation; resolve it through `ResolveBundle`; pass only that vendor's supported capability array and structured frontmatter values; and write the rendered skill beneath the existing project-local directory:

| Adapter | Required target                           | Capability contract            | Fast-track frontmatter expectation                                         |
| ------- | ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Claude  | `.claude/skills/specd-fasttrack/SKILL.md` | `mcp`, `agents`, `frontmatter` | Claude-compatible structured values; no template-static/unsupported fields |
| Copilot | `.github/skills/specd-fasttrack/SKILL.md` | `frontmatter`, `agents`        | Copilot-supported values only; unavailable-capability branches omitted     |
| Codex   | `.codex/skills/specd-fasttrack/SKILL.md`  | `mcp`, `agents`, `frontmatter` | Codex-compatible structured `name` and `description` values                |

The installed content must retain the incremental journal-resumability rule. Shared output remains frontmatter-free and outside the discovered skill directory.

## Implementation Status

**Claude — conformant by source inspection.** `skillFrontmatter` registers `specd-fasttrack` with `name` and the required description in `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`. `InstallSkills.execute()` obtains all skill names from the repository for an unfiltered install, uses literal `['mcp', 'agents', 'frontmatter']`, invokes `ResolveBundle`, and writes non-shared skill files under `.claude/skills/<name>/`. The graph identifies this map as flowing into `InstallSkills` and `create` (three affected files; MEDIUM risk).

**Copilot — conformant by source inspection.** Its corresponding map provides just `name` and `description` for `specd-fasttrack`. The installer supplies only literal `['frontmatter', 'agents']`, uses `ResolveBundle`, and routes files to `.github/skills/<name>/`. It does not add `allowed-tools` to the fast-track value collection, consistent with the change's assertion that unsupported runtime branches are omitted. The same graph path connects map, installer and plugin factory (three affected files; MEDIUM risk).

**Codex — conformant by source inspection.** Its map likewise contains only the intended two fields. `InstallSkills.execute()` supplies `['mcp', 'agents', 'frontmatter']`, resolves each bundle through `ResolveBundle`, and writes skills under `.codex/skills/<name>/`; its agent TOML wrapper is only applied to agent files, not standard skills. Graph impact is again map → installer → factory (three affected files; MEDIUM risk).

**Execution evidence.** `pnpm --filter @specd/plugin-agent-claude --filter @specd/plugin-agent-copilot --filter @specd/plugin-agent-codex test -- install-skills.spec.ts` passed: Claude 5 tests, Copilot 4 tests, Codex 4 tests (13 total). All install tests create a unique OS temporary project root with `mkdtemp`, exercise writing/reading paths, and remove it in `finally` with recursive forced cleanup.

## Discrepancies

No source-level discrepancy was found against the three change deltas: all three adapters enumerate `specd-fasttrack` through their default repository listing, use the mandated `ResolveBundle` path, provide vendor-limited capability arrays, and preserve their platform directory contracts.

**Test-assurance finding (medium, non-blocking):** the fast-track installation tests replace `createSkillRepository()` with a mocked repository and mocked `getBundle()` response. They prove each adapter's path routing, capability/context handoff, and file I/O, but the asserted journal text and rendered frontmatter are synthetic fixture strings rather than the actual `@specd/skills` `specd-fasttrack` template. Therefore they cannot independently detect a regression in template discovery, capability-gated rendering, or the real journal wording while the vendor code remains unchanged.

This is a coverage limitation, not evidence that the implementation violates the spec. The skills-package tests are the appropriate complementary evidence for real template rendering.

## Test Coverage

| Requirement area                                                               | Claude                                   | Copilot                                                        | Codex                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Default install includes `specd-fasttrack` at vendor path                      | Covered with a temporary filesystem      | Covered with a temporary filesystem                            | Covered with a temporary filesystem                                   |
| Bundle resolution receives expected capability set                             | Covered (`mcp`, `agents`, `frontmatter`) | Covered (`frontmatter`, `agents`); no MCP branch asserted      | Indirectly covered via installed fixture; frontmatter context covered |
| Vendor frontmatter source values                                               | Covered by call-context assertion        | Covered by call-context assertion                              | Covered by exact two-line rendered fixture assertion and call context |
| Incremental journal instruction survives install                               | Covered against fixture content          | Not covered: test only asserts frontmatter/capability omission | Covered against fixture content                                       |
| Shared output remains un-frontmattered and uninstall does not harm user skills | Covered                                  | Covered                                                        | Covered                                                               |
| Reinstall/selected uninstall behavior for fast-track                           | Covered                                  | General uninstall coverage only                                | General uninstall coverage only                                       |

The global testing dependency is met at the adapter boundary: these are integration-style filesystem tests using real temporary directories, while the repository boundary is mocked.

## Missing Tests

1. Add one integration test per vendor (or a parameterized shared suite) that does **not** mock `createSkillRepository`/`getBundle`, installs into a temporary project root, and reads the real `specd-fasttrack` template output.
2. In that test, assert the exact incremental journal rule from the real rendered template for all three vendors. Copilot currently lacks any journal-content assertion.
3. Assert the actual capability branches: Claude/Codex output includes the intended MCP/agent guidance when supported; Copilot output omits both unavailable guidance and does not leave unresolved template syntax.
4. Parse actual frontmatter rather than fixture text and assert vendor keys precisely: Claude's supported output, Copilot's absence of unsupported keys, and Codex's two-field fast-track contract.
5. Add explicit default-install assertions that all real repository items include fast-track once, rather than only relying on a two-item repository fixture and `installed.length === 2`.

## Spec Dependency Chain

`plugin-agent-{claude,copilot,codex}:plugin-agent`
→ `core:config` (configuration and project-root contract)
→ `plugin-manager:agent-plugin-type` (install/uninstall interface)
→ `skills:skill-bundle` (shared/non-shared bundle routing)
→ `skills:skill-repository` (skill enumeration and lookup)
→ `skills:resolve-bundle` (canonical rendered bundle and default variables)
→ `skills:agents` (agent support)
→ `skills:agent-instruction-template` (base prompt/block management).

The audit additionally applied `default:_global/testing`: filesystem adapter integration tests must use real temporary filesystems, which these tests do. The capability-gated template itself is owned by the change's `skills:skill-templates-source` and `skills:resolve-bundle` deltas; their direct verification is outside this vendor-adapter batch, but is necessary to close the real-rendering gap above.

## Summary counts

- Specs audited: 3 change specs + 1 relevant global testing spec.
- Requirements assessed for this change: 12 adapter-specific installation/frontmatter/path assertions.
- Conformant by source inspection: 12.
- Blocking discrepancies: 0.
- Non-blocking test-coverage findings: 1 (real-template end-to-end installation absent).
- Focused test execution: 3 packages, 13 tests passed.
