# Partial audit: agent plugin specs (plugin-architecture)

Scope: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.
Method: spec-preview (merged) vs. source in packages/plugin-agent-\*/src and packages/skills/src/application/shared-folder-owners.ts, plus test files. Unit tests green (given).

## Cross-cutting implementation findings (all five plugins)

- Manifests (specd-plugin.json): schemaVersion 2, no pluginType, `contributes.agents.<id>` = claude/copilot/codex/opencode/standard. COMPLIANT.
- Factory: `src/index.ts` async `create(_options)`, reads manifest from own dir then parent, throws PluginValidationError, constructs plugin with name/version. No `type` discriminator. COMPLIANT.
- install/uninstall take `AgentInstallContext` and delegate `context.config` / `context.options` (claude-plugin.ts). No configSchema. COMPLIANT.
- Capabilities passed as literals/defaults: claude [mcp,agents,frontmatter]; copilot [frontmatter,agents]; codex [mcp,agents,frontmatter]; opencode [mcp,agents,frontmatter]; standard ['frontmatter']. No buildCapabilities helper. ResolveBundle used (no direct getBundle). COMPLIANT.
- Prompt injection: injectSpecdBlock(path, prompt, '<id>') on install (CLAUDE.md / copilot-instructions.md / AGENTS.md); full uninstall calls removeSpecdBlock; filtered uninstall returns early (keeps block). opencode additionally calls removeSpecdBlock before inject (spec-required). COMPLIANT.
- Owners protocol: install calls addSharedOwner(sharedDir, id) iff something was written to shared dir (shared files or agent fallback), for filtered and unfiltered installs. Full uninstall: removeSharedOwner -> if hadMarker && remaining empty -> delete shared.md + `<agent>.agent.md` + removeSharedFolderIfEmpty. Filtered uninstall returns before touching marker. COMPLIANT.
- Agent placement: `supportsAgents` derived from `capabilities.includes('agents')`; else agents go to sharedDir as `<name>.agent.md` (claude/codex/opencode/copilot); standard unconditional sharedDir. COMPLIANT.
- Shared-folder resolve: `shared-folder.ts` duplicated verbatim in all 5 packages (not a spec discrepancy; design note only; low).
- NOTE: the `diff` tooling output in this environment was unreliable; I read codex/opencode uninstall files directly and confirmed they use `.codex`/`.opencode` paths and `'codex'`/`'opencode'` ids.

## 1. plugin-agent-claude:plugin-agent

Requirements (13): Factory export, Manifest/install context, Domain layer, Frontmatter type, Application layer, Frontmatter injection, Install location, Prompt Injection, Uninstall behavior, Shared folder ownership/placement, Fast-track install, Manual-only fast-track routing (+constraints).
Implementation: all implemented. Skills -> .claude/skills/<name>/, agents -> .claude/agents/<name>.md; tools comma-string; `model` from `item.metadata.model` (omitted when absent); fast-track frontmatter has `disable_model_invocation: true` and "Manual-only: use only when the user explicitly invokes /specd-fasttrack". Frontmatter type has all 14 fields.
Discrepancies: none material. Low: `tools: metadata.allowed_tools.split(', ').join(', ')` is a no-op round trip (harmless dead logic).
Tests (install-skills.spec.ts, 12 tests): routing + shared markdown, agent frontmatter, model, CLAUDE.md inject/uninstall, owner registration (filtered), other-owner keeps files, sole-owner removes folder, foreign file, legacy no-marker, filtered uninstall keeps marker, agent fallback to shared dir. Good coverage.
Missing tests: manifest content/schemaVersion/no pluginType; factory reads manifest name/version & manifest-parent fallback; no `type` discriminator; async factory awaited (4 factory scenarios + "Manifest declares agents contribution"); "Install receives the context"; frontmatter type field-set scenarios; domain layer file existence; "does not call getBundle directly" (static); fast-track description wording (only 1 grep hit for disable_model_invocation; partially covered).
Counts: reqs 12/12 implemented; scenarios ~41; with direct test ~22; no test ~19 (mostly factory/manifest/static-structure).

## 2. plugin-agent-copilot:plugin-agent

Requirements (11): Factory, Manifest, Runtime contract, Skill install + frontmatter injection, Frontmatter field contract, Install location, Prompt injection, Uninstall, Shared ownership, Fast-track, Manual-only.
Implementation: all implemented. Skills -> .github/skills/<name>/, agents -> .github/agents/<name>.agent.md with `tools` as YAML list; prompt in .github/copilot-instructions.md; fast-track has `'disable-model-invocation': true` + manual-only description. Frontmatter type: name, description, license, allowed-tools, user-invocable, disable-model-invocation (exact set).
Discrepancies: none material. Info: spec Dependencies lists `skills:skill-templates-source` while claude/codex/... list `skills:skill-repository` (spec-side inconsistency; code uses createSkillRepository from @specd/skills in all) - low, spec wording.
Tests (7 tests): routing, agent YAML wrapper, prompt inject/uninstall, user file kept, filtered install registers owner, other owner remains, agent fallback to shared dir.
Missing tests: factory/manifest scenarios (as above); last-owner-removes-folder; foreign file keeps folder (partly "user file in shared folder" test, line 344); legacy no-marker; filtered uninstall keeps marker + shared files; "selected agent file removal"; fast-track unsupported branches omitted (14 fasttrack hits, probably covered in main test; not verified in detail).
Counts: reqs 11/11 implemented; scenarios ~38; tested ~17; untested ~21.

## 3. plugin-agent-codex:plugin-agent

Requirements (11) similar. Implementation: complete. Agents -> .codex/agents/<name>.toml with name, description, `developer_instructions = """..."""` using escapeTomlBasicMultiline (backslash test present); fallback `<name>.agent.md` in shared dir; AGENTS.md block via inject/removeSpecdBlock('codex'); uninstall removes `.toml` agents. Frontmatter limited to name/description. Fast-track has manual-only description (no disable flag required for codex).
Discrepancies: none material.
Tests (6 tests): routing, TOML wrapper, AGENTS.md inject/uninstall, TOML escaping, other-owner keeps prompt ref + shared.md, agent fallback.
Missing tests (notable): NO test of `.owners.json` for codex at all: install registers owner, filtered install registers owner, last-owner removes shared files + empty folder, foreign file keeps folder, legacy no-marker, filtered uninstall keeps marker (6 owner scenarios). Also factory/manifest, legacy `<specd-plugin:codex>` marker purge (only via skills block-manager tests), filtered AGENTS.md block retention.
Counts: reqs 11/11 implemented; scenarios ~39; tested ~13; untested ~26. Severity of gap: medium (shared-folder protocol code is identical to claude's but unverified for codex).

## 4. plugin-agent-opencode:plugin-agent

Requirements (15 incl. wizard + meta package). Implementation: complete. `mode: 'subagent'` and `permission` map via `toOpenCodePermission` (bare tool -> allow, patterned -> nested map, bare+patterns -> "\*": allow per spec), agents -> .opencode/agents/<name>.md; remove-then-inject block; shared ownership. Wizard: cli init.ts lists opencode (test project-init.spec "supports --plugin with @specd/plugin-agent-opencode"). Meta package: packages/specd/package.json has 5 workspace deps (agent plugins), consistent.
Discrepancies: none material. Frontmatter type includes `allowed_tools` (spec explicitly allows for agent entries).
Tests (6 tests): routing, default fast-track render, agent frontmatter (permission), AGENTS.md block + uninstall, other-owner keeps ref, agent fallback.
Missing tests: same owner-marker gap as codex (no `.owners.json` assertions: 6 scenarios); permission edge cases (bare+pattern merge, no duplicate keys) beyond what the agent test covers; filtered-uninstall prompt retention; meta package dependency test (static); factory/manifest.
Counts: reqs 15/15 implemented; scenarios ~42; tested ~16; untested ~26. Gap severity: medium for owners.

## 5. plugin-agent-standard:plugin-agent

Requirements (15 incl. allowed-tools, wizard, meta). Implementation: complete. Capabilities ['frontmatter']; skills -> .agents/skills/<name>/; agents unconditionally `<sharedDir>/<name>.agent.md`; AGENTS.md block 'standard'; filtered agent uninstall removes only `<sharedDir>/<agent>.agent.md` and does not touch marker; allowed-tools strings are space-separated with `Bash(x *)` style, compliance includes git/gh/node/pnpm; fasttrack has allowed-tools incl. node/specd/pnpm/Agent. Init wizard lists `@specd/plugin-agent-standard`.
Discrepancies: none material. Info: install maps agent `allowed-tools` by splitting on ',' into an array whereas skills use space-separated string - dead path today (standard agentFrontmatter entries have no allowed-tools); would mis-handle space-separated values if ever added (low, latent).
Tests (9 tests): .agents/skills routing + allowed-tools, default fast-track, agent wrapper, AGENTS.md inject/uninstall, selected agent uninstall, allowed-tools space style/compliance, two tagged blocks, selected agent removal from shared folder, legacy no-marker. Best owner coverage after claude.
Missing tests: last-owner removes folder, foreign file keeps folder, other-owner-remains (only 5 owners mentions), filtered uninstall keeps marker, factory/manifest, wizard/meta static.
Counts: reqs 15/15 implemented; scenarios ~38; tested ~19; untested ~19.

## 6. skills:shared-folder-owners

Requirements (5): Owners marker file, Registering an owner, Releasing an owner, Removing folder only when empty, Uninstall protocol for agent plugins (+constraints).
Implementation (packages/skills/src/application/shared-folder-owners.ts, exported from index.ts): addSharedOwner (mkdir recursive, sorted unique, idempotent byte-identical, replaces invalid marker), removeSharedOwner (invalid/missing -> {remaining:[], hadMarker:false} without writing; non-owner no-op; deletes marker when none remain), removeSharedFolderIfEmpty (rmdir; swallows only ENOTEMPTY/ENOENT). Uses only node:fs/promises, no logging. Marker is `{ "owners": [...] }` with trailing newline. COMPLIANT.
Subtle: a missing marker is treated as `undefined` and invalid as `{kind:'absent'}`; both yield hadMarker false; read never repairs. addSharedOwner on invalid replaces with only the id - spec-conformant.
Discrepancies: none. Constraint "no concurrency" - not applicable.
Tests: shared-folder-owners.spec.ts (13 tests) + shared-folder-owners-eacces.spec.ts cover all 15 unit scenarios of the first four requirements including EACCES propagation. Uninstall-protocol scenarios are covered at the plugin level (claude full set; copilot partial; standard partial; codex/opencode missing, see above).
Counts: reqs 5/5 implemented; scenarios 20; 15 unit-tested directly, 5 protocol scenarios tested via claude (all), partially via others.

## Overall severity summary

- High: none. No spec/code contradictions found in these six specs.
- Medium: test gap - codex and opencode have no owners-marker tests (install registration, last-owner cleanup, foreign file, legacy, filtered). Copilot lacks last-owner/legacy/filtered-uninstall-marker tests; standard lacks last-owner/foreign/other-owner tests.
- Low: no tests for factory/manifest scenarios in any plugin (manifest schemaVersion/contributes, name/version from manifest, no `type`, async awaited); shared-folder.ts duplicated 5x; standard agent allowed-tools split(',') latent; copilot spec dependency names `skills:skill-templates-source` vs others `skills:skill-repository` (spec wording).
