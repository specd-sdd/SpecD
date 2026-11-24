# Partial audit: batch "agents" (change plugin-architecture)

Specs: plugin-agent-claude / copilot / codex / opencode / standard `:plugin-agent`.
Method: merged spec-preview (spec.md + verify.md), dependency `plugin-manager:agent-plugin-type` (merged preview), code in `packages/plugin-agent-*/src`, test titles and selected assertions in `packages/plugin-agent-*/test`. I did not read every test assertion line by line, so coverage verdicts are "by test title plus spot checks".

Common structure: all five packages share an identical `src/index.ts` (async `create`, manifest read from own dir then parent) and near-identical `InstallSkills` / `UninstallSkills`. Manifests are identical in shape: `schemaVersion: 2`, no `pluginType`, `contributes.agents.<id>`. A defect in the shared pattern therefore applies to all five.

## Cross-cutting findings (apply to all five specs unless noted)

- **[MAJOR] X1. The `sharedFolder` directory is never removed on unfiltered uninstall.**
  - Code: all five `uninstall-skills.ts` do `await rm(sharedDir)` (no `recursive`) inside a try/catch that swallows errors.
  - `fs/promises.rm` on a directory without `recursive: true` always throws `ERR_FS_EISDIR`, even for an empty directory. I confirmed this with node. The catch hides it, so the (empty) folder always stays.
  - Spec text: "uninstall MUST remove ... the resolved sharedFolder location" and "the resolved sharedFolder location is removed".
  - Possibility A (code wrong): use `rm(dir, {recursive:true})` guarded by "only specd files remain", or `rmdir` for the empty-directory case.
  - Possibility B (spec wrong): the real intent is "remove the specd shared files, keep the folder if user files are present". The claude test title "preserves non-specd user files and sharedFolder" suggests the folder is intentionally kept, but an empty folder is also kept, which the spec forbids.
  - Tests only assert that the shared file is gone (claude spec line ~199). No test asserts that the directory itself is gone.

- **[MAJOR] X2. Verify scenarios in copilot and codex contradict the same spec's "No type discriminator".**
  - `plugin-agent-copilot` and `plugin-agent-codex` verify.md, scenario "Created plugin satisfies runtime contract", say "the returned plugin has `type: 'agent'`".
  - The same spec's Factory requirement and its "No type discriminator" scenario say the plugin MUST NOT carry `type`. The dependency spec `agent-plugin-type` also drops `type`.
  - The code has no `type`, and all five `*-plugin.spec.ts` assert `not.toHaveProperty('type')`. So the code is right and the scenario is stale (spec wrong).
  - The same requirement also says "implements `install(config, options)`", but the contract is now `install(context)`. This is a stale signature.

- **[MINOR] X3. The "agents capability missing -> install agent next to shared.md" fallback is not implemented as a branch.**
  - It appears as a numbered step or scenario in the claude, codex and opencode specs.
  - `capabilities` is a hardcoded literal including `'agents'`, so the fallback path never runs. There is no test.
  - Possibility A: the requirement is vacuous for a static capability set, so reword it or drop it.
  - Possibility B: code should gate the target directory on `capabilities.includes('agents')`.
  - The standard plugin does implement the fallback, unconditionally, because it declares only `['frontmatter']`.

- **[MINOR] X4. `factory create()` signature.**
  - Spec: `create(options): AgentPlugin`.
  - Code: `async create(...): Promise<AgentPlugin>`.
  - This is probably fine if the loader awaits it. I did not verify the loader contract in `plugin-manager`; the spec text should say `Promise<AgentPlugin>` or "or a promise of".
  - Scenario "Exports create function: `create(): AgentPlugin`" is imprecise for the same reason.

- **[MINOR] X5. Legacy cleanup is not in the specs.** Every uninstall also does `rm(sharedDir/<agent>.agent.md)` and `rm(<skill>.md)` (legacy flat files). The specs do not list this. Either add it to the specs or accept it as an implementation detail.

- **[MINOR] X6. Prompt block removal is skipped when a filter is given.**
  - When `options.skills` or `options.agents` is provided, uninstall returns early and does not call `removeSpecdBlock`.
  - Spec text "uninstall() MUST remove the `<!-- <specd> -->` block" is unconditional, but filtered uninstall is arguably partial, so keeping the block is sensible.
  - The spec should say "on full uninstall". Install always (re)injects the block, including for filtered installs.

- **[MINOR] X7. Prompt block literal.** Specs for claude and copilot say the file contains `<!-- <specd> -->` and "no plugin-specific marker block". Code calls `injectSpecdBlock(path, prompt, 'claude'|'copilot')`, so `skills/specd-block-manager` writes `<!-- <specd agents="claude"> -->`. There is no separate marker block, so the intent holds, but the literal scenario text ("contains the `<!-- <specd> -->` block") is not exact. The spec is likely stale compared with the codex, opencode and standard wording, which describe the `agents="..."` reference-counted block.

- **[MINOR] X8. Domain-layer file locations and shape.** For claude, the spec says `claude-plugin.ts`, `frontmatter.ts` and `frontmatter/` live in the domain layer. Code puts them in `domain/types/claude-plugin.ts`, `domain/types/frontmatter.ts` and `domain/frontmatter/index.ts`. The spec also says `frontmatter/` exports `skillFrontmatter` only, while all plugins also export `agentFrontmatter`. This is a spec path imprecision.

- **Dependency check (`plugin-manager:agent-plugin-type`, merged).** `install(context: AgentInstallContext)` and `uninstall(context)` are implemented by all five plugin classes, forwarding `context.config` and `context.options`. The no-`type` rule, `isAgentPlugin` without `type`, capability identifiers (`mcp`, `agents`, `frontmatter`), `variables.frontmatter` and the `variables.sharedFolder` pass-through are all consistent with the code. Contradictions are limited to X2 (stale scenario text) and the copilot/codex "install(config, options)" wording. Standard and opencode specs do not repeat the stale text.

---

## plugin-agent-claude:plugin-agent

### Requirements Summary

Factory export; manifest + install context; domain layer; frontmatter type (14 Claude fields); application layer (`InstallSkills`, caps `['mcp','agents','frontmatter']`, `ResolveBundle`, agents to `.claude/agents`, sub-agent `tools` string and `model`); frontmatter injection; install location; CLAUDE.md prompt injection; uninstall; fast-track install; manual-only fast-track (`disable_model_invocation: true`).

### Implementation Status

- Factory/manifest: IMPLEMENTED. `schemaVersion: 2`, `agents.claude`, no `pluginType`, no `type`.
- Frontmatter type: IMPLEMENTED. All 14 fields present in `domain/types/frontmatter.ts`.
- Application layer: IMPLEMENTED. `ResolveBundle`, literal capabilities, `variables.sharedFolder` pass-through, skills to `.claude/skills/<n>/`, agents flat to `.claude/agents/<n>.md`, shared to `sharedFolder`. No YAML is prepended after resolution.
- Agent sub-mapping: PARTIAL. `tools` comes from `allowed_tools` via `split(', ').join(', ')`, which is a no-op. `model` is mapped only if `agentFrontmatter[name].model` exists, and no agent defines one. The spec says the model comes from `specd-agent.meta.json`; the code never reads that file.
- Fast-track: IMPLEMENTED. `disable_model_invocation: true` and the manual-only description; no static frontmatter extras.
- Prompt injection: IMPLEMENTED (see X7). `extraInstructions` is not used, which the spec allows (MAY).
- Uninstall: IMPLEMENTED except X1 and X6.

### Discrepancies

- [MAJOR] X1 (sharedFolder directory kept).
- [MINOR] Model source: spec says `specd-agent.meta.json`; code uses the in-package `agentFrontmatter` map and no agent has a model. Either the spec is stale or the code should read the meta file.
- [MINOR] Spec step 6 says agents install to `.claude/agents/<agent-name>/` (directory form). Scenarios and code use the flat `<agent-name>.md`. The spec is internally inconsistent; code matches the scenarios.
- [MINOR] X3, X4, X6, X7, X8.

### Test Coverage (`test/install-skills.spec.ts`, `test/domain/types/claude-plugin.spec.ts`)

Covered: shared routing and no frontmatter in shared files; capability list `mcp/agents/frontmatter`; agent YAML (`tools` string at line ~267); uninstall with non-specd user files in shared folder; CLAUDE.md block inject and uninstall; constructor metadata; context forwarding; manifest shape; `not.toHaveProperty('type')`; fast-track mentioned in tests (18 refs).

### Missing Tests

- Agent `model` mapping.
- `agents`-capability fallback.
- Selected-agent-file uninstall (probably partly covered; not verified).
- Assertion that the shared directory itself is removed (X1).
- Unsupported-key exclusion (type-level only).
- Domain-layer structural scenarios (no executable test; acceptable).

### Summary counts

Critical 0 / Major 1 (X1) / Minor 6 (model source, agents dir wording, X3, X4/X6, X7, X8).

---

## plugin-agent-copilot:plugin-agent

### Requirements Summary

Factory; manifest; runtime contract; skill install + injection (caps `['frontmatter','agents']`, agents to `.github/agents/<n>.agent.md` with `tools` as a YAML list); frontmatter field contract (name, description, license, allowed-tools, user-invocable, disable-model-invocation); install location `.github/skills`; prompt to `.github/copilot-instructions.md`; uninstall; fast-track; manual-only with `disable-model-invocation: true`.

### Implementation Status

- All requirements IMPLEMENTED. The `tools` list is built from `allowed-tools` via split on `,` and trim.
- Frontmatter type exactly matches the contract (`name`, `description`, `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`).
- Fast-track frontmatter has `disable-model-invocation: true` and the manual-only description.
- Prompt: `injectSpecdBlock(..., 'copilot')`; uninstall calls `removeSpecdBlock(..., 'copilot')`.

### Discrepancies

- [MAJOR] X2 (scenario "has `type: 'agent'`" vs "No type discriminator"; also stale `install(config, options)` text).
- [MAJOR] X1.
- [MINOR] The runtime-contract requirement says "implements `install(config, options)`" (stale).
- [MINOR] Spec lists no Domain layer requirement, unlike claude. Not a defect.
- [MINOR] X4, X5, X6, X7.

### Test Coverage

Covered: shared routing; capabilities `['frontmatter','agents']`; Copilot agent wrapper (YAML `tools`); prompt inject and uninstall; user file in the shared folder survives uninstall; constructor and manifest; no `type`.

### Missing Tests

- The "Copilot omits unsupported fast-track branches" scenario (the fast-track mock exists, but there is no dedicated test with an assertion on omitted capability branches).
- Selected `.agent.md` removal.
- Shared directory removal (X1).
- The frontmatter field-contract scenarios are type-level only.

### Summary counts

Critical 0 / Major 2 (X1, X2) / Minor 5.

---

## plugin-agent-codex:plugin-agent

### Requirements Summary

Factory; manifest; runtime contract; install (caps `['mcp','agents','frontmatter']`; agents as TOML `.codex/agents/<n>.toml` with `developer_instructions = """..."""` and TOML escaping); frontmatter contract (name and description only); location `.codex/skills`; AGENTS.md shared and reference-counted prompt (`'codex'`); uninstall; fast-track (name and description only); manual-only description.

### Implementation Status

- IMPLEMENTED: TOML generation (`name`, `description` via `JSON.stringify`, `developer_instructions` multiline, `escapeTomlBasicMultiline`). The frontmatter type has only `name` and `description`. `inject`/`remove` use `'codex'`.
- Agent bundles are given no frontmatter variables, which matches the TOML design.
- PARTIAL: step 11 fallback (X3). Not implemented as a branch.

### Discrepancies

- [MAJOR] X2 (`type: 'agent'` scenario contradicts "No type discriminator").
- [MAJOR] X1.
- [MINOR] X3, X4, X5, X6.
- [MINOR] Codex shares `AGENTS.md` with opencode and standard. The spec scenarios "keeps shared block while another plugin references it" and "legacy marker purged" depend on `skills` block-manager behavior. Codex has a test for "marker and uninstalls cleanly" but I did not see a two-plugin scenario test in this package (the standard package has one).

### Test Coverage

Covered: shared routing; fast-track name/description-only frontmatter and journal-resumability content (asserted in the test); TOML wrapper; backslash escaping; AGENTS.md prompt inject/uninstall; constructor, manifest, no `type`.

### Missing Tests

- Multi-plugin reference-count scenario (codex plus another plugin).
- Legacy-marker purge on uninstall (title suggests partial coverage).
- Fallback (X3).
- Selected `.toml` removal.
- Shared directory removal (X1).

### Summary counts

Critical 0 / Major 2 (X1, X2) / Minor 5.

---

## plugin-agent-opencode:plugin-agent

### Requirements Summary

Factory (named export); manifest; domain types; frontmatter contract (name, description, license, compatibility, metadata; agent `allowed_tools` becomes the `permission` list); application layer (caps `['mcp','agents','frontmatter']`, agents `.opencode/agents/<n>.md`, `mode: subagent`, permissions from tools); install location; AGENTS.md shared block with `removeSpecdBlock` before `injectSpecdBlock`; wizard listing; meta-package dependency; uninstall; fast-track; manual-only.

### Implementation Status

- IMPLEMENTED: factory, manifest, frontmatter type (includes the extra `allowed_tools`, as the spec permits for agents), `mode: 'subagent'`, permissions transform, and `removeSpecdBlock` then `injectSpecdBlock`.
- Wizard: `@specd/plugin-agent-opencode` is in `packages/cli/src/commands/project/init.ts`. Meta package: `@specd/plugin-agent-opencode: workspace:*` is in `packages/specd/package.json`.
- Uninstall: IMPLEMENTED except X1 and X6.
- Fast-track: IMPLEMENTED with name and description only, and the manual-only description. The map is not dependent on a static `disable` field.

### Discrepancies

- [MAJOR] X1.
- [MAJOR, verify] Key name and shape of permissions. Spec text says "Open Code `permission` list"; the scenario says `permissions`; code emits `permissions: [{bash: 'allow'}, ...]` (a list of single-key maps, with duplicate `bash` entries when several Bash patterns exist: the test asserts 4 identical `{ bash: 'allow' }`).
  - I found no template in `packages/skills/templates` that renames the key. The rendered output depends on how the agent template serializes `variables.frontmatter`, which I did not trace.
  - Possibility A (code wrong): OpenCode's real agent frontmatter key is singular `permission` and a map, not a list. The output may not be honoured by OpenCode, and the duplicate entries are redundant.
  - Possibility B (spec wrong): both the "permission" prose and the "permissions" scenario are loose, and the plugin's key is whatever the skills template expects. This needs a check against the OpenCode docs and the skills agent template.
- [MINOR] Test title in `install-skills.spec.ts` line ~328 still claims "deploys plugin script, merges opencode.json" even though the body says no native plugin script is deployed. This is a stale title and a spec gap (no such requirement).
- [MINOR] Permissions are derived by lowercasing the base tool name (e.g. `Bash(node *)` becomes `bash`), so the pattern restriction is lost. The spec says only "transform allowedTools into permissions", so this is acceptable but lossy.
- [MINOR] X3, X4, X5, X6.

### Test Coverage

Covered: shared routing; default selection with fast-track and capabilities `['mcp','agents','frontmatter']` (line ~218); agent frontmatter (`mode: subagent`, `permissions`); AGENTS.md inject and uninstall; constructor, manifest, no `type`.

### Missing Tests

- Wizard and meta-package scenarios (these are repo-level; check the CLI tests).
- Multi-plugin shared-block scenarios.
- Legacy marker removal on install.
- Fallback (X3).
- Shared directory removal (X1).
- Selected-skill uninstall that keeps the shared location.

### Summary counts

Critical 0 / Major 2 (X1, permissions key/shape verify) / Minor 5.

---

## plugin-agent-standard:plugin-agent

### Requirements Summary

Factory (named export); manifest; domain types; frontmatter contract (name, description, license, compatibility, metadata, `allowed-tools` space-separated); application layer (caps `['frontmatter']` only; skills to `.agents/skills/<n>/`; agents to the shared folder, since `agents` is unsupported); location; AGENTS.md shared block (`'standard'`); `allowed-tools` configuration per skill; wizard and meta-package inclusion; uninstall (skills only mentioned); fast-track `allowed-tools`; manual-only description.

### Implementation Status

- IMPLEMENTED: capability list, agents written to `<sharedDir>/<n>.agent.md` (the fallback is implemented unconditionally), `allowed-tools` with a hyphen as a space-separated string, `inject`/`remove` with `'standard'`.
- The fast-track map has `allowed-tools: 'Bash(node *) Bash(specd *) Bash(pnpm *) Read Write Edit Grep Glob Agent'` and the manual-only description.
- Wizard and meta-package: `@specd/plugin-agent-standard` is present in `project/init.ts` and `packages/specd/package.json`.

### Discrepancies

- [MAJOR] X1.
- [MINOR] `specd-compliance` `allowed-tools` uses the colon style (`Bash(git:*) Bash(gh:*)`) while all other entries use the space style (`Bash(node *)`). The spec requires "matching the agentskills.io format (space-separated)" for the list but does not specify the pattern syntax. It also lacks the `Bash(node *)` / `Bash(pnpm *)` entries that the "tool strings MUST include" list mentions. This is probably fine for a skill that does not use them; the spec wording "where applicable" is loose.
- [MINOR] The spec's uninstall requirement mentions only skills, but code also handles `options.agents` (removes `<shared>/<n>.agent.md`). Add this to the spec. Agent installs for the standard plugin land inside the shared directory, so the spec's "unrelated files remain" guarantee needs a sentence for the shared folder.
- [MINOR] The comment in `agentFrontmatter` says the entries are "unused for frontmatter injection", but `install-skills.ts` does build `frontmatter` variables for agents (`allowed-tools` is split into an array). This is dead or misleading code or comment; agent entries define no tools, so no `allowed-tools` is emitted.
- [MINOR] X4, X5, X6.

### Test Coverage

Covered: writes to `.agents/skills/` with `allowed-tools`; fast-track with standard frontmatter only; agent YAML wrapper; AGENTS.md inject and clean uninstall; agent file plus user file uninstall; space after the command pattern in `allowed-tools`; two-tagged-blocks uninstall (reference counting); constructor, manifest, no `type`.

### Missing Tests

- Shared directory removal (X1).
- Wizard and meta-package scenarios.
- Selected-skill uninstall that keeps the shared directory (partly covered, unverified).

### Summary counts

Critical 0 / Major 1 (X1) / Minor 5.

---

## Batch summary

| Spec     | Critical | Major | Minor |
| -------- | -------- | ----- | ----- |
| claude   | 0        | 1     | 6     |
| copilot  | 0        | 2     | 5     |
| codex    | 0        | 2     | 5     |
| opencode | 0        | 2     | 5     |
| standard | 0        | 1     | 5     |

Distinct findings: 0 critical, 3 major (X1 sharedFolder never removed, which affects all five; X2 `type: 'agent'` scenario contradiction in copilot and codex; opencode `permissions` key/shape to verify), plus about 9 minor findings (X3 to X8 plus per-plugin items). Counting each spec's own findings as listed above gives 0 critical / 8 major / 26 minor.

Spec vs code: Everything in these specs is implemented. The main risk is X1, the swallowed `ERR_FS_EISDIR`. Next is the stale verify text in copilot and codex (X2). Tests are generally good for install routing and prompt injection, and weaker on shared-directory removal, the capability fallback and multi-plugin reference counting for codex and opencode.
