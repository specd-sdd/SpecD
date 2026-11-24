# Partial audit: plugin-agent-\* specs (change plugin-architecture)

Scope: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent (merged via spec-preview) vs packages/plugin-agent-\* and plugin-manager:agent-plugin-type.
Legend: OK / DISC (discrepancy) / UNTESTED (implemented, no test asserts it). Neither spec nor code is assumed correct.

## Cross-cutting findings (apply to all 5 plugins)

### X1. Spec self-contradiction on `type` discriminator (DISC, spec-vs-spec, spec-vs-dependency)

- Every spec's "Factory export" says: "The `type` field MUST remain hardcoded as `'agent'`" (claude/copilot/codex/opencode/standard). Claude/opencode/standard "Domain layer" repeats "The `type` getter MUST return `'agent'`". Copilot and Codex "Plugin runtime contract" scenario: "returned plugin has `type: 'agent'`".
- Every verify.md "No type discriminator" scenario: "returned plugin has no `type` property".
- Dependency plugin-manager:agent-plugin-type: "Whether a plugin is an agent plugin is determined by its manifest declaring `contributes.agents`, not by a `type` field".
- Code: no `type` getter in any plugin (e.g. packages/plugin-agent-claude/src/domain/types/claude-plugin.ts:30-80). Tests assert `not.toHaveProperty('type')` (claude-plugin.spec.ts:19, codex-plugin.spec.ts:18, opencode-plugin.spec.ts:18, agent-standard-plugin.spec.ts:18, copilot-plugin.spec.ts presumably same).
- Resolution options: (a) spec is stale -> remove the "type hardcoded" sentences and the `type: 'agent'` scenarios (code + dependency spec + "No type discriminator" scenarios agree); (b) the spec is right -> code must add a `type` getter, but that contradicts agent-plugin-type and its own verify scenarios. Recommend (a).

### X2. Prompt-block injection contract: spec vs code (DISC) - codex, opencode, standard (and claude/copilot wording)

- Codex/opencode/standard spec: `injectSpecdBlock(agentsMdPath, prompt)` with NO tag; `install()` MUST call `removeSpecdBlock(agentsMdPath, "<id>")` to purge legacy marker; `uninstall()` MUST call `removeSpecdBlock(path, "<id>")` THEN `removeSpecdBlock(path)` (base block). Scenarios: AGENTS.md contains `<!-- <specd> -->` base block; legacy marker removed on install.
- Code:
  - codex install: `injectSpecdBlock(agentsMdPath, prompt, 'codex')` (packages/plugin-agent-codex/src/application/use-cases/install-skills.ts ~line 139); NO `removeSpecdBlock` on install; uninstall only `removeSpecdBlock(path,'codex')` (uninstall-skills.ts ~line 59) with comment "reference-counted block manager removes block when 0 agents remain".
  - opencode: install does `removeSpecdBlock(path,'opencode')` then `injectSpecdBlock(path, prompt, 'opencode')` (install-skills.ts ~line 160-162); uninstall only `removeSpecdBlock(path,'opencode')`.
  - standard: `injectSpecdBlock(.., 'standard')` (install-skills.ts ~line 150); no legacy purge; uninstall only `removeSpecdBlock(path,'standard')`.
  - claude: `injectSpecdBlock(CLAUDE.md, prompt, 'claude')`; copilot: `injectSpecdBlock(.., 'copilot')`; claude spec says "only the base `<!-- <specd> -->` block is injected (no plugin-specific marker block)".
- Tests encode the code behaviour, i.e. a different marker format: `<!-- <specd agents="claude"> -->` (claude install-skills.spec.ts:~330), `agents="copilot"` (copilot spec:305), `agents="codex"` (codex:287), `agents="opencode"` (opencode:374), `agents="standard"` (standard:344). None asserts `<!-- <specd> -->` literally, and no test seeds a legacy `<!-- <specd-plugin:X> -->` block.
- Interpretation A (code is right): a newer reference-counted block manager in @specd/skills tags the block with the agent list (`<specd agents="...">`); specs (claude, copilot, codex, opencode, standard "Prompt Injection" + the legacy-purge/two-step-uninstall scenarios) are stale and should be rewritten to the ref-counted model. Evidence for A: code comments in uninstall-skills.ts, uniform tag across all 5 plugins, all tests agree.
- Interpretation B (spec is right): code should call the untagged API, purge the legacy marker on install, and remove the base block on uninstall. This would break shared-AGENTS.md semantic for codex+opencode+standard (the first uninstall would remove the block for the others) - the spec's two-step uninstall is unsafe under shared files.
- Also: uninstall with a skills/agents FILTER returns early in all 5 plugins before removing the prompt block (spec says `uninstall()` removes it; scenarios only cover unfiltered, so ambiguous).

### X3. `agents` capability fallback not implemented as conditional (DISC/UNTESTED) - claude, codex, opencode

- Specs (claude Application layer #8, codex #11, opencode #8; scenarios "Fallback to shared location when agents capability is missing" and dependency agent-plugin-type "Agent installation and fallback"): if `agents` capability is missing, install agents next to shared.md.
- Code: capabilities are a hard-coded literal including `agents` (claude install-skills.ts:64, codex ~:63, opencode ~:62), so the branch can never trigger; no code path writes an agent into sharedDir in claude/codex/opencode. Only standard (no `agents` capability) always writes agents to sharedDir (standard install-skills.ts ~line 118 `itemTargetDir = sharedDir`), and copilot declares `agents`.
- Options: spec is describing a generic contract that these plugins satisfy vacuously (capability always present) -> scenario is not applicable, should be rewritten/removed for fixed-capability plugins; or code should honour `options.capabilities` (not done; plugin ignores `options.capabilities` input).
- Tests: none for any of the 3 plugins (UNTESTED).

### X4. `create` signature (minor DISC)

- Specs: `create(options: PluginLoaderOptions): AgentPlugin`. Code: `async create(_options): Promise<AgentPlugin>` in all 5 index.ts. Likely loader awaits (not verified here; see plugin-manager:plugin-loader). Spec text should say `Promise<AgentPlugin>` or the code is wrong. Low risk.

### X5. Legacy uninstall leftovers (code quirk, not in spec)

- claude/codex/opencode unfiltered uninstall removes `<sharedDir>/<agent>.agent.md` and `shared.md` individually then `rm(sharedDir)` (non-recursive; fails silently if user files exist). Spec says "the resolved sharedFolder location is removed" AND "MUST NOT remove unrelated files". Code resolves the tension by non-recursive rmdir (user files preserved); copilot uses `rm(sharedDir,{recursive:true})` which would delete user files in the shared folder (see copilot D2). Test claude "non-specd user files in sharedFolder" covers only claude.

### X6. Agent-frontmatter coverage (UNTESTED, all 5)

Agent tests mock `getBundle` and return fixed content, so assertions only verify the _variables passed_ (`variables.frontmatter`) and that the file exists with the prompt; none verifies that YAML/TOML frontmatter really prepends the system prompt in the written file (spec: "Prepend the rendered system prompt with the generated YAML frontmatter"). That rendering is in @specd/skills (outside this partial).

---

## 1. plugin-agent-claude:plugin-agent

Requirements summary: factory; manifest v2 `agents.claude`; domain layer (claude-plugin.ts, frontmatter.ts, frontmatter/); Frontmatter type (14 fields); InstallSkills (caps `['mcp','agents','frontmatter']`, ResolveBundle, sharedFolder, agent sub-mapping tools string + model); Frontmatter injection; Install location (.claude/skills, .claude/agents); Prompt Injection (CLAUDE.md); Uninstall; Fast-track install; Manual-only fast-track.

Implementation status:

- Factory/manifest: OK. packages/plugin-agent-claude/src/index.ts:11-55 (own dir then parent), specd-plugin.json (schemaVersion 2, no pluginType, agents.claude).
- Domain layer: OK (files live under src/domain/types/ and src/domain/frontmatter/index.ts; spec gives names only).
- Frontmatter type: OK, all 14 fields (src/domain/types/frontmatter.ts:1-74). Scenario "unsupported key excluded": type-level only (no runtime filtering).
- Application layer: OK. ResolveBundle (install-skills.ts:~95), literal caps (:64), sharedFolder only passed through if user supplied, no getBundle direct call, no buildCapabilities. Agent mapping: `tools` string from `allowed_tools` (line ~78; `.split(', ').join(', ')` is a no-op), `model` only if present (none of the shipped agent entries define `model`).
- Install location: OK (.claude/skills/<n>/, .claude/agents/<n>.md, default sharedFolder `<configPath>/skills/shared`, shared-folder.ts:51-53). No SKILL.md written in shared dir by plugin (depends on bundle).
- Prompt Injection: DISC (X2): tag 'claude' used; spec says no plugin-specific marker. `extraInstructions` not used (MAY).
- Uninstall: OK for filter/unfiltered/unrelated preserved (uninstall-skills.ts). Minor: sharedDir removal is non-recursive rmdir after deleting shared.md and agent.agent.md.
- Fast-track install and manual-only: OK. frontmatter/index.ts has `disable_model_invocation: true` and "Manual-only ... /specd-fasttrack" description. "No static or unsupported frontmatter fields": entry has only name, description, disable_model_invocation.

Discrepancies: X1 (type), X2 (marker), X3 (agents fallback never reachable), X4.

Scenario coverage (test/install-skills.spec.ts, test/domain/types/claude-plugin.spec.ts):

- Exports create function: OK (implicit via import).
- Factory reads manifest name/version: UNTESTED (claude-plugin.spec.ts uses constructor directly with '0.0.1'; create() with manifest version never asserted).
- No type discriminator: OK (claude-plugin.spec.ts:19).
- Manifest declares agents contribution: OK (claude-plugin.spec.ts:33).
- Install receives context: OK (claude-plugin.spec.ts:21; forwards config+options).
- Install emits Claude frontmatter via skills rendering: OK/partial (mock bundle supplies frontmatter; test checks `description:` present; install-skills.spec.ts:~140).
- Shared files no frontmatter: OK (:~176).
- Installs to .claude/skills + sharedFolder default: OK (:~120-180).
- Shared dir has no SKILL.md: UNTESTED.
- Installs agents to categorized dir (tools string, model): partial. Asserts `variables.frontmatter.tools` string (:~255); `model` never asserted (no agent defines it); file location asserted (:~272).
- Fallback when agents capability missing: UNTESTED / not implemented (X3).
- CLAUDE.md block written/removed: OK but asserts `<specd agents="claude">` (DISC with spec text X2).
- Uninstall selected skill dirs keeps shared: OK (:~165). Without filter removes managed + shared, keeps user skills: OK (:~172).
- Uninstall selected agent files (agents filter): UNTESTED. Uninstall all managed agents + keeps unrelated user agents: UNTESTED (only user _skill_ and shared-dir user files tested).
- Domain layer contains claude-plugin.ts / frontmatter.ts: UNTESTED (structural; trivially true).
- Frontmatter values cover supported metadata / unsupported excluded: UNTESTED (no test on type; compile-time only).
- InstallSkills passes Claude values / only Claude caps / ResolveBundle: OK for fasttrack (:~157-170 asserts capabilities and variables.frontmatter); getBundle spy is the underlying call through ResolveBundle.
- Shared files to sharedFolder: OK.
- Does not call getBundle directly: UNTESTED (review-only scenario; code satisfies).
- Default Claude install includes fast-track (+ journal contract): OK (:~150-156).
- Installing fast-track for Claude (manual-only, disable_model_invocation true): OK (:~160-170).

Counts: 29 scenarios. OK 15, DISC 2 (marker, +type spec contradiction counted separately in X1), UNTESTED/gap 10 (factory version, SKILL.md in shared, model, fallback, agents-selective uninstall, agents-unfiltered uninstall, domain files, frontmatter-cover, unsupported-key exclusion, no-getBundle-direct) plus 2 partial.

## 2. plugin-agent-copilot:plugin-agent

Requirements: factory; manifest `agents.copilot`; runtime contract; skill installation (caps `['frontmatter','agents']`, ResolveBundle, skills -> .github/skills, agents -> .github/agents/<n>.agent.md with `tools` YAML list); frontmatter field contract (name, description, license, allowed-tools, user-invocable, disable-model-invocation); install location; prompt injection (.github/copilot-instructions.md); uninstall; fast-track install; manual-only.

Implementation status:

- Factory/manifest: OK (src/index.ts, specd-plugin.json).
- Capabilities `['frontmatter','agents']`: OK (install-skills.ts:64) - note differs in order only.
- Agent mapping: OK. `tools` is a string[] derived from `allowed-tools` split on ',' (install-skills.ts:~77-90); `.agent.md` suffix OK; writes to .github/agents.
- Frontmatter type: OK, exactly the 6 spec fields (src/domain/types/frontmatter.ts: name, description, license, allowed-tools(string|string[]), user-invocable, disable-model-invocation).
- Fast-track: OK; frontmatter entry has name, description, `'disable-model-invocation': true` (frontmatter/index.ts:15-20). Specs says allowed-tools not required.
- Install location: OK.
- Prompt injection: `injectSpecdBlock(.github/copilot-instructions.md, prompt, 'copilot')` - spec says without tag/marker discussion (spec only requires injectSpecdBlock and `<!-- <specd> -->` block) -> DISC X2 (minor; Copilot spec doesn't forbid tag but scenario expects `<!-- <specd> -->` and test asserts `<specd agents="copilot">`).
- Uninstall: DISC D2 below.

Discrepancies:

- D1: X1 (spec says `type:'agent'` in Runtime contract scenario and "No type discriminator" in same verify.md).
- D2: unfiltered uninstall does `rm(sharedDir,{recursive:true,force:true})` (uninstall-skills.ts ~line 50) which deletes non-specd user files placed in sharedFolder. Spec: "the resolved sharedFolder location is removed" AND "MUST NOT remove unrelated directories or files under .github/skills or .github/agents" (shared folder itself not in the protected list). So code matches the letter of the spec; claude/codex/opencode/standard behave differently (preserve user files). Inconsistent across plugins; decide which is intended (spec for claude says "resolved sharedFolder location is removed" too). Option A: copilot is right and others should be recursive; Option B: others are right (safer) and copilot should be non-recursive.
- D3: X2 tag.
- D4: `tools` source: agents' `allowed-tools` strings in copilot frontmatter use Claude-style `Bash(node *), ...` (frontmatter/index.ts:51), split by ',' -> items with embedded spaces/parens; Copilot may not recognise these tool names. Spec only requires list form; semantic validity unspecified.

Scenario coverage (test/install-skills.spec.ts, test/domain/types/copilot-plugin.spec.ts):

- Exposes factory: OK. Reads manifest name/version: UNTESTED. No type discriminator: OK.
- Manifest agents.copilot: OK (copilot-plugin.spec.ts:29). Install receives context: OK (:21).
- Runtime contract scenario (`type:'agent'`): DISC X1; capability ids not objects: OK implicitly (:~130 `getBundle` called with capabilities array? not asserted explicitly) -> UNTESTED strictly.
- Install passes caps + frontmatter values: partial: fasttrack frontmatter asserted (:156-170); capabilities array itself not asserted for copilot.
- Routes shared/non-shared, shared no frontmatter: OK (:179-181).
- Does not call getBundle directly: UNTESTED (review).
- Frontmatter value model full set / unsupported excluded: UNTESTED (type-only).
- Skills under .github/skills + shared default: OK. No SKILL.md in shared: UNTESTED.
- Installs agent profiles .github/agents with .agent.md and tools list: partial (:253-287 checks `variables.frontmatter` and file content 'prompt-content'; tools list assertion unclear; file name .agent.md asserted via path).
- Prompt injection write/remove: OK but marker `agents="copilot"` (:305,313).
- Uninstall selected skill keeps shared: OK (:183-184). Without filter: OK (:196-198).
- Uninstall selected agent files / all managed agents + keep user agents: UNTESTED.
- Copilot omits unsupported fast-track branches: OK (:154-155 absent MCP text, no `allowed-tools:`).
- Manual-only + disable-model-invocation: OK (:156-170).

Counts: 27 scenarios. OK 14, DISC 2 (+X1), UNTESTED 11.

## 3. plugin-agent-codex:plugin-agent

Requirements: factory; manifest `agents.codex`; runtime contract; skill install (caps `['mcp','agents','frontmatter']`, agents -> .codex/agents/<n>.toml with name, description, developer_instructions multi-line string + TOML escaping; fallback when agents missing); frontmatter contract (name, description only); install location (.codex/skills); prompt injection AGENTS.md (untagged inject, purge legacy on install, two-step uninstall); uninstall; fast-track; manual-only.

Implementation status:

- Factory/manifest: OK.
- Caps literal: OK (install-skills.ts:~63).
- Agent TOML: OK in shape (install-skills.ts:~118-132): `name = JSON.stringify(..)`, `description = JSON.stringify(..)`, `developer_instructions = """ ... """`.
  - DISC D1 (escaping): only `"""` is escaped (`replace(/"""/g,'\\"\\"\\"')`); backslashes in the prompt are NOT escaped. In a TOML multi-line basic string `\` starts an escape sequence, so content with `\n`-like text, Windows paths, regexes or `\` followed by invalid char yields invalid TOML or altered text. Spec: "Ensure the instructions are correctly escaped for TOML." Option A: code bug (escape `\` first, or use `'''` literal string); Option B: spec is fine, current agent prompts happen to have no backslashes (not verified here).
  - Also `JSON.stringify` for TOML strings is mostly compatible but not identical (e.g. U+2028 and lone surrogates).
  - Frontmatter for agents is intentionally not passed (variables.frontmatter only for skills) - consistent with TOML wrapper.
- Frontmatter contract: OK (types: name, description only).
- Fast-track: OK (frontmatter name+description only). Manual-only description: OK.
- Prompt injection: DISC X2 (inject with 'codex' tag; no legacy purge on install; uninstall only removes tagged ref). Spec scenarios "Legacy plugin marker removed on install" and "Uninstall removes AGENTS.md base block" are not implemented as written.
- Uninstall: OK (.toml removal, shared.md, rmdir sharedDir).
- Fallback agents missing: X3.

Scenario coverage:

- Factory/name/version: version via manifest UNTESTED; no type: OK (codex-plugin.spec.ts:18); manifest: OK (:29); install context: OK (:21; only install forwarding tested, uninstall forwarding not).
- Runtime contract `type:'agent'`: DISC X1; no capability objects: UNTESTED explicitly.
- Install passes Codex caps + values: OK (install-skills.spec.ts:127-165, fasttrack frontmatter lines 151-153 equals exactly name/description).
- Routes shared/non-shared: OK. No direct getBundle: UNTESTED.
- Value model limits to name+description / unsupported excluded: UNTESTED (type-only; fasttrack frontmatter exact-match test partially covers).
- Install location + no SKILL.md in shared: first OK, second UNTESTED.
- Agents to .codex/agents/\*.toml with developer_instructions, multi-line, escaped: OK (install-skills.spec.ts:263-269 incl. triple-quote escaping); backslash escaping UNTESTED.
- Fallback agents missing: UNTESTED / not implemented.
- AGENTS.md prompt block: DISC (asserts `<specd agents="codex">` and absence of legacy marker, :287-288). Uninstall removes block: OK (:290-295) but via ref-count semantics. Legacy marker removal on install: UNTESTED and not implemented.
- Uninstall selected skills / all, keep user skills: OK. Selected agents / all managed agents + keep user agents: UNTESTED.
- Default Codex installation renders fast-track (frontmatter only name+description, journal resumability): OK (:151-156). Manual-only description: OK (frontmatter index).

Counts: 28 scenarios. OK 14, DISC 4 (marker install, legacy purge, base-block uninstall, TOML backslash escaping), UNTESTED 10.

## 4. plugin-agent-opencode:plugin-agent

Requirements: factory (named export); manifest `agents.opencode`; domain layer; frontmatter type (name, description, license, compatibility, metadata); application layer (caps `['mcp','agents','frontmatter']`; skills -> .opencode/skills, agents -> `.opencode/agents/<agent-name>/`; mode: subagent, permissions list from allowedTools); frontmatter injection; install location; prompt injection AGENTS.md; wizard integration; meta package; uninstall; fast-track; manual-only.

Implementation status:

- Factory/manifest: OK. Named export `create`: OK.
- Frontmatter type: DISC D1: types/frontmatter.ts includes an extra `allowed_tools?: string` (lines ~30-33, "Optional allowed tools list for agents"), outside the "exact field set" (name, description, license, compatibility, metadata); "Unknown fields MUST NOT be represented". It is used only for agent mapping, so skill output is unaffected, but the type contradicts the "exact" wording. Option A: spec should add an agent-only field; Option B: map agent tools elsewhere (separate agent-metadata type).
- Agents path: DISC D2 spec-internal: Application layer says `.opencode/agents/<agent-name>/` (directory), Uninstall requirement/scenarios and Install-location scenario say `.opencode/agents/` and `specd-project-context-optimizer.md`. Code writes flat `.opencode/agents/<name>.md` (install-skills.ts ~line 125). Code matches uninstall/scenarios; Application-layer bullet 6 is stale.
- Agent mapping: OK in effect: `mode: 'subagent'` + `permissions` as array of `{tool: 'allow'}` (install-skills.ts:~77-92). Quirk: duplicates (4x bash) since `Bash(node *)`, `Bash(specd *)`... each produce `{bash:'allow'}`; and permissions derived from Claude-style strings. Scenario text: "`permissions` mapped from allowedTools" OK; whether the Open Code runtime accepts the list-of-single-key form is unspecified (spec example shows `- bash: allow`, so OK).
- Prompt injection: DISC X2 (partially compliant: calls `removeSpecdBlock(path,'opencode')` on install before inject, satisfying legacy purge; but inject uses tag 'opencode'; uninstall lacks base-block removal).
- Wizard: OK (packages/cli/src/commands/project/init.ts:15-19 includes opencode). Test: cli/test/commands/project-init.spec.ts:108 `supports --plugin with @specd/plugin-agent-opencode` (OK, though it tests the --plugin flag, not the interactive list).
- Meta package: OK (packages/specd/package.json:23 `workspace:*`). No test (UNTESTED; structural).
- Fast-track: OK (frontmatter name+description only; capability-aware content retained).
- Manual-only: OK.
- Fallback: X3.
- Domain layer: OK (type, frontmatter, map).

Scenario coverage:

- Named create factory: OK; version from manifest: UNTESTED; no type: OK (:18).
- Manifest: OK (:29). Install context: OK (:21).
- Domain contract: UNTESTED (structural).
- Frontmatter value model supported set / unsupported excluded: UNTESTED (and D1).
- Install passes caps + values (fast-track test lines 215-232: capabilities `['mcp','agents','frontmatter']` and frontmatter asserted, 'mcp-instructions'/'agent-instructions' retained): OK.
- Shared no frontmatter: OK (:133-134).
- Skills in .opencode/skills + sharedFolder default: OK; No SKILL.md in shared: UNTESTED.
- Agents to .opencode/agents with mode subagent and permissions: OK for variables (:292-310) + path (:313-322); content-level YAML UNTESTED (X6).
- Fallback agents missing: UNTESTED / not implemented.
- AGENTS.md write: DISC (asserts `agents="opencode"`, :374-375); uninstall removes (:385-389, preserves existing content): OK. Legacy marker removal on install: UNTESTED (code removes only tag 'opencode' ref, not the legacy `<specd-plugin:opencode>` form unless block manager handles it).
- Wizard exposes option: partial (init spec tests --plugin flag).
- Meta package depends: UNTESTED.
- Uninstall selected skills / unfiltered + user skills: OK (:136-151). Selected agents / all managed agents + keep user: UNTESTED.
- InstallSkills follows workflow / no YAML prepend / no direct getBundle: partial/UNTESTED (review).
- Default opencode installation includes fast-track: OK (test :157-233). Manual-only: OK (frontmatter asserted at :215+).

Counts: 33 scenarios. OK 16, DISC 4 (marker, frontmatter extra field, agents dir path spec-inconsistency, base-block uninstall), UNTESTED 13.

## 5. plugin-agent-standard:plugin-agent

Requirements: factory; manifest `agents.standard`; domain layer; frontmatter type (name, description, license, compatibility, metadata, `allowed-tools` space-separated); application layer (caps `['frontmatter']`; skills -> .agents/skills; agents -> same dir as shared); frontmatter injection; install location; prompt injection AGENTS.md; allowed-tools configuration (`Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)`, Agent...); wizard; meta package; uninstall (skills only); fast-track (allowed-tools incl. Agent); manual-only.

Implementation status:

- Factory/manifest: OK. Caps literal `['frontmatter']`: OK (install-skills.ts:~58).
- Frontmatter type: OK (6 fields: name, description, license, compatibility, metadata, allowed-tools; src/domain/types/frontmatter.ts).
- allowed-tools configuration: DISC D1. Spec: tool strings "matching the agentskills.io format (space-separated)" and listing `Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)`. Code uses `Bash(node:*) Bash(specd:*) Bash(pnpm:*)` (colon-star form) (frontmatter/index.ts:7-45). Space-separated: OK. Pattern syntax: differs from spec's literal examples. Option A: code right (agentskills.io/Claude legacy permission syntax `Bash(cmd:*)`; spec examples are loose notation); Option B: spec right (matches the Claude plugin's `Bash(node *)`), code should change. Also test asserts only `Bash(`.
  - Missing from spec list? `specd-new` has no Write/Edit (appropriate); spec requires "Agent where applicable": present for design/implement/new/compliance/fasttrack.
- Agent fallback (to sharedDir as `<name>.agent.md`): OK (install-skills.ts:~120-135); agentFrontmatter entries carry no allowed-tools; code still passes `allowed-tools` list if present (unreachable for shipped data), and passes frontmatter variable for agents despite comment "unused for frontmatter injection" (comment in frontmatter/index.ts says unused; code in install-skills.ts:~78-88 does build `agentFrontmatterVars` and sends it as `variables.frontmatter`). Inconsistent comments vs code (D2, low).
- Prompt injection: DISC X2 (tag 'standard', no legacy purge, no base-block removal).
- Uninstall: OK for skills. D3 code quirk: unfiltered path never deletes `<sharedDir>/<agent>.agent.md` files (only shared.md), so `rm(sharedDir)` (non-recursive) fails silently whenever an agent file was installed, leaving sharedFolder behind - violates "the resolved sharedFolder location is removed". Spec for standard doesn't talk about agents in uninstall; filtered path removes them. Option A: code bug (add agent-file removal like claude/codex/opencode do); Option B: spec should state agents fallback files are left alone.
  - Also `managedSkills = list().map(...)` is used for both skills and agents (no kind filter) - harmless.
- Wizard: OK (init.ts:19). Meta package: OK (packages/specd/package.json:24).
- Fast-track: OK. allowed-tools = `Bash(node:*) Bash(specd:*) Bash(pnpm:*) Read Write Edit Grep Glob Agent` (see D1 for syntax). Instruction omission for unsupported caps: OK (test asserts no mcp/agent instructions, :243-244).
- Manual-only: OK (description).

Scenario coverage:

- Named create: OK. name/version from manifest: UNTESTED. No type: OK (:18).
- Manifest: OK (:34-40). Install context: OK (:21-31).
- Domain contract: UNTESTED (structural).
- Frontmatter value model/ allowed-tools hyphen: OK (`allowed-tools:` present and `allowed_tools:` absent, install-skills.spec.ts:126-128); space-separated value: partial (test mock string, not real data; `Bash(` only).
- Install passes caps + values: OK (:112-125, :221-241).
- Shared no frontmatter: OK (:139-140).
- Install to .agents/skills + shared default: OK. No SKILL.md in shared: UNTESTED.
- Fallback for agents (sharedDir): OK-ish (:250-327 verifies agent frontmatter variables and 'prompt-content'; location assertion presumed in test, not confirmed).
- AGENTS.md: DISC (asserts `agents="standard"`, :344-345); uninstall removes: OK (:347-352). Legacy marker: UNTESTED and not implemented.
- allowed-tools per skill (non-empty, includes Read and `Bash(node *)`): UNTESTED against real map (tests use mock bundles; real skillFrontmatter never inspected) and DISC D1 on syntax.
- Wizard: partial (no standard-specific test; opencode only at project-init.spec.ts:108). Meta package: UNTESTED.
- Uninstall selected skills / unfiltered + user skills: OK (:142-157).
- InstallSkills workflow, no YAML prepend, no direct getBundle: partial/UNTESTED (review).
- Default Standard installation declares fast-track tools: OK (:163-244 asserts allowed-tools string). Manual-only: OK (:229).

Counts: 28 scenarios. OK 14, DISC 3 (marker/legacy/base-block, allowed-tools syntax, sharedFolder left behind when agents present), UNTESTED 11.

## Dependency spec check: plugin-manager:agent-plugin-type

- Install context shape (`AgentInstallContext` with config/options/contributions): consistent. All 5 plugins forward `context.config`/`context.options` only; `context.contributions` is ignored (OK; each plugin has a single contribution).
- Capability ids passed as arrays of identifiers, not objects: consistent in all 5 (literals).
- `variables.frontmatter` carries frontmatter; no pre-built YAML: consistent. Code spreads `options.variables` then sets `frontmatter`; user-supplied `variables.frontmatter` is overwritten (fine).
- `options.capabilities` (AgentInstallOptions) is ignored by all five plugins (they use their own literal). Dependency spec says capabilities are "supplied by the agent plugin at install time", so ignoring caller capabilities is consistent.
- `agents` fallback to shared.md directory: only standard exercises it (see X3).
- `type` contradiction: see X1; the plugin-agent specs contradict agent-plugin-type, which dropped `type`.
- Filename of shared context file: dependency spec says "same directory as the shared context file (`shared.md`)"; standard writes agents as `<name>.agent.md` in that dir (OK).

## Overall totals (scenario level, approximate)

| Spec     | Scenarios | OK  | Discrepancy | Untested/gap    |
| -------- | --------- | --- | ----------- | --------------- |
| claude   | 29        | 15  | 2           | 10 (+2 partial) |
| copilot  | 27        | 14  | 2           | 11              |
| codex    | 28        | 14  | 4           | 10              |
| opencode | 33        | 16  | 4           | 13              |
| standard | 28        | 14  | 3           | 11              |

## Highest-priority items

1. X2: prompt-block contract (tagged ref-counted block in code and tests vs untagged block + legacy purge + two-step uninstall in specs). Specs likely stale; decide and align 5 specs + add legacy-marker test.
2. X1: remove `type: 'agent'` language from 5 specs (contradicts verify.md and agent-plugin-type).
3. Codex TOML escaping gap for backslashes (real correctness risk).
4. Standard: sharedFolder not removed after unfiltered uninstall when agent files exist; allowed-tools syntax `Bash(x:*)` vs spec `Bash(x *)`.
5. Copilot recursive shared-folder removal inconsistent with other plugins.
6. Missing tests: agents-filter uninstall (all 5), user-agent preservation (all 5), agents-capability fallback (claude/codex/opencode), factory name/version from manifest via create() (all 5), meta-package and wizard for standard, no SKILL.md in shared (all 5), real-data `allowed-tools` check (standard).
