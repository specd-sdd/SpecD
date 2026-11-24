# Partial audit: batch sdk-agents (change plugin-architecture, attempt 5)

Read-only. Specs read via `changes spec-preview ... --artifact specs|verify`. Tests run: sdk 104 pass, claude 16, copilot 17, codex 17, opencode 14, standard 16 (all pass). Note: `rtk diff` output was unreliable (reported "identical" for non-identical files); I read files directly.

## Summary counts

- Critical: 0 | Major: 0 | Minor: 6 | Info: 4
- Both prior majors confirmed resolved (sdk:composition CLI dependency wording now matches `packages/cli/package.json`; owner registered before first shared write in all 5 plugins).
- Scenarios with no test (or only indirect): sdk 3, agent plugins ~8 distinct themes (listed per spec), skills 0 new.

---

## 1. sdk:composition -- status: COMPLIANT

Requirements (all met):

- Package identity/deps: `packages/sdk/package.json:13-17` deps = code-graph, core, plugin-manager only. No cli/mcp/plugin-agent-\*. plugin-manager deps: `@specd/core` only (`packages/plugin-manager/package.json:33`), no sdk -> acyclic.
- Layer structure: `src/` has composition, orchestration, presentation, shared, domain (+ core-reexports.ts, index.ts, ports.ts, extensions.ts); no infrastructure/. `domain/` only `errors/invalid-provider-lifecycle-error.ts`. `exports` has `.`, `./ports`, `./extensions` pointing at dist (`package.json:19-31`).
- Public barrel (`src/index.ts`): all listed names present: createSdkContext/openSpecdHost/withOpenGraphProvider + types (L5-12); ContributionKindHandler/ActivationContext types (L13); all 11 plugin errors incl. PluginDestroyError (L14-26); isPluginName/PLUGIN_NAME_REGEX/createConfigWriter via `core-reexports.ts:4,526-527`; orchestration (L28-42); InvalidProviderLifecycleError (L44); presentation (L48-52); code-graph symbols (L54-138); SDK_VERSION (L145). No `export * from '@specd/core'` (uses `export * from './core-reexports.js'`, acceptable, test asserts source). No Save/Update/Invalidate/PersistSpecMetadata exports.
- Import policy: CLI deps (`packages/cli/package.json:30-38`) = sdk, guide, 5 plugin-agent-\*, plugin-manager, schema-std; no core/code-graph. Matches loosened spec and scenario.
- Version: `index.ts:145`.

Scenario -> test:

- SDK depends on core/code-graph/plugin-manager: `sdk/test/composition/package-boundary.spec.ts:12` (also composition.spec.ts:8)
- Dependency graph acyclic: package-boundary.spec.ts:24
- Source tree / domain narrow: package-boundary.spec.ts:56; barrel.spec.ts:182
- Shared dir no public subpath: barrel.spec.ts:182
- No export star: barrel.spec.ts:82
- openSpecdHost/createKernel/buildProjectStatusSnapshot: barrel.spec.ts:36,45
- context markdown helpers: barrel.spec.ts:36 area / presentation specs (indirect; see gap G1)
- createGetStatus/createSpecRepository: barrel.spec.ts:45-53
- metadata surface + removed APIs: barrel.spec.ts:87, :100
- ports subpath / extensions: barrel.spec.ts:207, :213
- handler contracts (type-level): barrel.spec.ts:65 (runtime only, see G2)
- plugin error classes same class as plugin-manager: barrel.spec.ts:57
- Isolated worker / raw lock absent / built declarations / host w/o code-graph: barrel.spec.ts:116, :140, :164, :105
- CLI has no direct core/code-graph: package-boundary.spec.ts:42
- Plugin may depend on core: package-boundary.spec.ts:35
- SDK_VERSION: barrel.spec.ts:32
- Review barrel: barrel.spec.ts:36

Gaps / discrepancies:

- G1 (Info): "SDK exports context markdown presentation helpers" has no explicit assertion in barrel.spec.ts (`changeContextToMarkdown`/`projectContextToMarkdown` not asserted on the barrel; only unit-tested in presentation specs importing from src). Minor.
- G2 (Minor): "SDK exports handler contracts for plugin hosts" is declared a type-level assertion; barrel.spec.ts:65-80 only checks runtime error classes. `ContributionKindHandler`, `ContributionActivationContext`, `SdkContextOptions` have no type-level test (no `expectTypeOf`/tsc fixture). The built-declaration test (barrel.spec.ts:140) may cover SdkContextOptions indirectly; not verified.
- Spec lists `computeWorkspaceFingerprint` etc. and `SDK` aliases: all present.

---

## 2. sdk:host-context -- status: COMPLIANT

Code: `packages/sdk/src/composition/host-context.ts`.

- SdkHostContext shape (L24-35): kernel, createGraphProvider, dispose, AsyncDisposable; no config field. OK.
- createSdkContext (L98-123): builder from config+options.kernel (L102); `registerPlugins(builder, config, {handlers: options?.pluginHandlers ?? []})` unless `plugins === false` (L103-106) -- spec says handlers = "owned by plugin-manager plus options.pluginHandlers"; SDK passes only host handlers and relies on plugin-manager owning its own (consistent, not a defect); build awaited (L109); on build rejection dispose registration (L113-121); if dispose throws, the build error is rethrown and rollback errors attached (L116-119, 160-177). `dispose = () => kernel.dispose()` and `[Symbol.asyncDispose]` same fn (L124-129). Graph provider closes over same config (L127).
- rollbackErrors wording check: spec L301 / scenario "Build failure is not masked": code throws the ORIGINAL error E unchanged (identity preserved) and attaches enumerable `rollbackErrors` via defineProperty (L165-171). AggregateError is flattened to individual failures (L141-151) -- consistent with "the dispose errors are attached". Verified.
- Behaviour NOT stated in spec (Info I1): when E is a primitive/null (cannot carry properties) the rollback failures are logged via `Logger.warn` (L173-176). Spec text says only "attached as rollbackErrors". Code is a superset; spec could add one clause. Tested at host-context.spec.ts:105-130.
- openSpecdHost (L144-186 region): mixed configPath+startDir rejected (L137-139 area); forced vs discovery vs cwd; bootstrap fallback only for discovery + ConfigNotFoundError + flag (L155-170); returns `{config, configFilePath, ...ctx}` so disposal members carried. No config writes. OK.
- Config mutation boundary: no write methods.

Scenario -> test (`packages/sdk/test/composition/host-context.spec.ts` unless noted):

- Context exposes kernel/provider/dispose only: :282
- Context async-disposable / await using: :316
- Provider factory same config: :60
- awaits kernel construction: :60 (implicit, async)
- Each provider call new instance: :142
- Disposal delegates to kernel / same fn: :298
- Kernel options forwarded: :195 (checks createKernelBuilder with options; OK)
- Plugins registered before build: :60 (invocationCallOrder, :67-69)
- Plugins disabled: :73
- Plugins enabled by default: :60 (registerPlugins toHaveBeenCalled)
- Plugins enabled with empty plugin list: NO dedicated test (G3, Minor). registerPlugins is mocked in unit spec; e2e spec has no empty-config case.
- openSpecdHost forwards plugins option: :211
- Broken plugin fails context creation: host-context-e2e.spec.ts:113 (checks PluginInitError and no init order recorded) -- "already initialized plugins were destroyed" is NOT asserted (only one plugin `a` in that test; G4, Minor). Also "no kernel built" asserted only indirectly.
- Build failure disposes plugins: :79
- Build failure not masked by dispose failure: :95 (rejects.toBe(buildError), rollbackErrors [disposeError]) -- matches updated wording
- End to end real plugin-manager: host-context-e2e.spec.ts:103
- Extra handlers forwarded: :79 (objectContaining handlers [handler])
- Discovery mode cwd: :156; startDir: :221; forced path: :216; mixed rejected: :228; options forwarded: :195; warnings on config: :165,:177; fallback: :238; explicit config never falls back: :262
- Disposal: share promise :307; reverse destroy order host-context-e2e.spec.ts:103; await using :316; result carries members :326; providers not closed :333; no foreign-kernel API :344
- Host context has no write methods: :290

---

## 3. skills:shared-folder-owners -- status: COMPLIANT (spec allows node:path now)

Code: `packages/skills/src/application/shared-folder-owners.ts`.

- Marker: sorted/dedup (`sortUnique` L~128), `{owners}` shape check (L~165-175); invalid/unreadable -> "no marker" without repair in read path. OK.
- addSharedOwner: mkdir recursive, replace invalid marker with only agentId, idempotent when already owner (returns without write). OK.
- removeSharedOwner: valid -> remove/write/unlink; invalid -> `{remaining: [], hadMarker:false}` with no write; non-owner -> unchanged. OK.
- removeSharedFolderIfEmpty: `rmdir`, swallows only ENOTEMPTY/ENOENT. OK.
- Constraint "only node:fs/promises and node:path, no logging": imports are exactly those two (L1-2). OK. Exports from `skills/src/index.ts:23-27`.
- "Register before first write" requirement (L20): satisfied by all 5 plugins (see section 9 table).

Scenario -> test (`skills/test/application/shared-folder-owners.spec.ts`; EACCES in `shared-folder-owners-eacces.spec.ts`):

- Marker sorted/dedup :29; corrupt marker :67; first owner :38; idempotent :46; invalid replaced :56
- Owner registered before first shared write: plugin-level tests only (no skills-level test; correct place): claude `plugin-agent-claude/test/install-skills.spec.ts:589`, copilot `...copilot/test/install-skills.spec.ts:511`, codex `...codex/test/install-skills.spec.ts:497`, opencode `...opencode/test/install-skills.spec.ts:560`, standard `...standard/test/install-skills.spec.ts:554`. Each makes a 2nd shared write fail (dir named like file), asserts `.owners.json` == [agent], and a later full uninstall cleans up. Note: would also pass if registration happened after the first but before the second write (does not pin "before first"). Minor (G5).
- Owners remain / last owner / no marker / non-owner: :77, :87, :96, :109
- Empty folder removed :121; foreign file kept :129; missing folder :139; EACCES rethrown: eacces spec :20
- Uninstall protocol scenarios (another agent, last agent, foreign file, legacy, filtered): per-plugin tests (see sections 4-8); no skills-level test, and not needed.

---

## 4. plugin-agent-claude:plugin-agent -- status: COMPLIANT (spec wording issue D1)

Code: `plugin-agent-claude/src/index.ts`, `application/use-cases/install-skills.ts`, `uninstall-skills.ts`, `domain/types/claude-plugin.ts`, `domain/frontmatter/index.ts`.

- Factory: async `create`, manifest read from own dir then parent (index.ts:15-30), no `type` (claude-plugin.ts). Manifest `schemaVersion 2`, `contributes.agents.claude` (specd-plugin.json). Constructor takes name/version.
- Install: ResolveBundle; capabilities default `['mcp','agents','frontmatter']` (install-skills.ts:50); skills -> `.claude/skills/<n>/`, agents -> `.claude/agents/<n>.md` or sharedDir `<n>.agent.md` when no `agents` capability (L51-54, 128-130); `tools` passed as comma string and `model` only when `item.metadata.model` (L74-76); CLAUDE.md `injectSpecdBlock(...,'claude')` (L160-163). Owner registered before first shared write (L137-142). No `buildCapabilities`.
- Uninstall: filtered returns before touching owners/prompt/shared (uninstall-skills.ts:50-52); full removes managed skills (+legacy flat .md), agents, `removeSpecdBlock`, `removeSharedOwner` protocol, `removeSharedFolderIfEmpty`.
- No `Claude no-op` remains (confirmed `destroy`/`init` trivial but spec-neutral).

Scenario -> test (`plugin-agent-claude/test/install-skills.spec.ts` unless noted):

- Exports create / returns plugin: :143 (implicit), domain spec :8
- Factory reads manifest name/version: domain `claude-plugin.spec.ts:8` + install-skills :17 (version asserted)
- No type discriminator: install-skills.spec.ts:18
- Async factory awaited: :143 (await create)
- Manifest declares agents contribution: claude-plugin.spec.ts:33
- Install receives context: claude-plugin.spec.ts:21
- Frontmatter via skills rendering / shared w/o frontmatter: :143
- Install location / SKILL.md absent: :143 (SKILL.md refs :162,:172)
- Agent categorized dir + comma tools: :231 (tools at :292)
- Agent model from metadata: :549
- Agent without model omits key: NO explicit negative assertion (G6, Minor; :231 uses exact frontmatter object without model, which implicitly checks it -- weak but present)
- Fallback to shared when no agents capability: :491
- Prompt block install/uninstall: :345; filtered keeps block: :473/:483 (marker+shared; block kept assertion not verified separately)
- Uninstall selected skills, keep shared: :193/:210
- Uninstall without filter, unrelated user skills remain, legacy flat md: :223 (user-skill :217-225); legacy flat `.md` removal not asserted (G7 Minor)
- Uninstall selected agent files (options.agents): NO TEST (G8, Minor)
- Uninstall without filter removes all managed agents, unrelated user agents stay: NO explicit test (G8)
- Filtered uninstall keeps prompt block + marker: :473 (skills filter only; agents filter untested)
- Owner registration (full, filtered): :380 (filtered), full install covered by :400-:440
- Other owners keep files :400; last owner :422; foreign file :440; legacy no marker :457; agents next to shared.md :491
- Domain layer files / Frontmatter type fields / unsupported key excluded: NO tests (structural scenarios; G9 Info)
- InstallSkills passes values / ResolveBundle only / getBundle not called directly: :143 (getBundle mock refs :152,:178)
- Fast-track install + journal resumability: :167-:196; manual-only description + `disable_model_invocation: true`: :187

---

## 5. plugin-agent-copilot:plugin-agent -- status: COMPLIANT (D1)

Code: `plugin-agent-copilot/src/application/use-cases/install-skills.ts` (+ uninstall). Capabilities `['frontmatter','agents']` (L50); skills `.github/skills`, agents `.github/agents/<n>.agent.md` (always `.agent.md`, also in shared fallback); `tools` emitted as YAML list via `splitTopLevelCommas` (top-level comma split, parentheses-aware, L~90-100 and bottom of file); prompt `.github/copilot-instructions.md` tag `copilot`; owner registered before first shared write (L145-150). Uninstall: removes `.github/agents/<n>.agent.md`; protocol identical to claude.
Frontmatter type (`domain/types/frontmatter.ts`): name, description, license, allowed-tools, user-invocable, disable-model-invocation = exact spec set.

Scenario -> test (`plugin-agent-copilot/test/install-skills.spec.ts`):

- Factory/manifest/context: :18 (`type`), `domain/types/copilot-plugin.spec.ts:8,:21,:29`
- Runtime contract / no capability objects / ResolveBundle only: :147 (getBundle refs :156,:182)
- Shared files routed: :147; Frontmatter field contract + unsupported keys absent: NO dedicated type test (G9)
- Install location / SKILL.md absent: :147
- Agent profiles to `.github/agents/` (tools list): :230 (tools array :292); top-level comma split: :594
- Prompt block: :319 (filtered keeps block: only via :493 marker test; block assertion not separate)
- Uninstall selected skills: :209; unfiltered: :222; selected agent files: NO TEST; all managed agents: NO explicit test (G8)
- Owner scenarios: filtered install registers :363; other owners :383; last owner :457; foreign file :476; filtered uninstall keeps marker :493; legacy no marker :549; agents next to shared.md :401; owner before first write :511
- Fast-track omits unsupported branches + manual-only (`disable-model-invocation`): :565 (:581)

---

## 6. plugin-agent-codex:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: capabilities `['mcp','agents','frontmatter']`; agents -> `.codex/agents/<n>.toml` with `name`, `description` via `escapeTomlBasicString` (L~232-262, escapes `\\ " \b \t \n \f \r` and control chars as \uXXXX), `developer_instructions = """..."""` via `escapeTomlBasicMultiline` (escapes `\\` and `"""`); fallback `<n>.agent.md` in sharedDir; prompt AGENTS.md tag `codex`; owner before first shared write (L~128-133). Uninstall removes `<n>.toml` (full + filtered), unlike claude's `.md` (correct, `uninstall-skills.ts:49,67`). Frontmatter type name+description only.
Note: `escapeTomlBasicMultiline` calls `.trim()` on content (strips leading/trailing whitespace) -- harmless, not in spec (Info I2).

Scenario -> test (`plugin-agent-codex/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:29; runtime contract/ResolveBundle: :144
- Agents TOML: :223; backslash escaping: :327; basic string escaping: :579,:587
- Prompt block + legacy marker not injected: :301; other owner remains :375
- Uninstall selected skills :208, all :215; selected agent files (toml) / all agents: NO TEST (G8)
- Owner scenarios: :375 (other owners), :443 (last owner), :462 (foreign), :479 (filtered), :535 (legacy), :398 (agents capability missing), :497 (owner before first write)
- Filtered install registers owner: no codex-specific test (G10 Minor; covered for claude :380 and copilot :363 only)
- Fast-track: :551
- Frontmatter field contract / unsupported keys: NO test (G9)

---

## 7. plugin-agent-opencode:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: `mode: 'subagent'`, `permission` map via `toOpenCodePermission` (lowercased tool, `{ '*': allow, pattern: allow }` nesting, no duplicate keys because Map-grouped; spec rule fulfilled); agents `.opencode/agents/<n>.md` or sharedDir `<n>.agent.md`; install calls `removeSpecdBlock(...,'opencode')` then `injectSpecdBlock` (L~160-163) as the spec requires to purge legacy; owner before first shared write; uninstall protocol; wizard lists `@specd/plugin-agent-opencode` (`cli/src/commands/project/init.ts:18`); meta package dependency (`packages/specd/package.json:23`).

Scenario -> test (`plugin-agent-opencode/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:29; Frontmatter field set / unsupported keys: NO test (G9)
- Install passes capabilities / shared w/o frontmatter: :125; fast-track: :182
- Agents + bash pattern restrictions + plain tools allow: :264 (permission :326-333); `"*": allow` merge of bare+pattern: NOT tested (G11 Minor)
- Prompt block + legacy marker removed on install: :355 (:389-402); keep block while another references: :427; filtered keeps: not separately
- Uninstall selected skills :161, all :174; selected agents / all agents: NO TEST (G8)
- Wizard/meta-package scenarios: `cli/test/commands/project-init.spec.ts` (wizard); meta-package: no test found (G12 Info)
- Owner scenarios: :427, :506, :525, :542, :598, :450, :560
- Filtered install registers owner: no opencode-specific test (G10)

---

## 8. plugin-agent-standard:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: capabilities literal `['frontmatter']` (L~58); skills `.agents/skills/<n>/`; agents unconditionally `<n>.agent.md` in sharedDir; the previous dead branch is gone (confirmed: no `supportsAgents` in the file); AGENTS.md tag `standard`; owner before first shared write; uninstall filtered agents removes `<n>.agent.md` from sharedDir only (explicit exception allowed by owners spec L44); frontmatter map uses `allowed-tools` with space-style `Bash(x *)`; `specd-compliance` has node, pnpm, git, gh.

Scenario -> test (`plugin-agent-standard/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:34; Frontmatter field set / hyphen: NO test (G9)
- Install location / fallback: :128, :275; fast-track: :188
- Prompt: :357; two tagged blocks :437; legacy marker purge on uninstall: :357 (:370)
- allowed-tools each skill: :422 only covers fasttrack + compliance (G13 Minor: "every Bash pattern uses space style" is asserted for 2 of 8 skills)
- specd-compliance tools: :422
- Uninstall selected skills :167, all :180, selected agent file :456, user file stays :383
- Owner scenarios: :500 (last owner), :519 (foreign), :536 (filtered), :484 (legacy), :554 (owner before first write); filtered-install-registers and other-owners-keep: no standard-specific test (G10)
- Wizard/meta: same as opencode.

---

## 9. Cross-cutting: owner registration before first shared write (all 5 plugins)

| Plugin                           | file:line (addSharedOwner call, guarded by !ownerRegistered, inside write loop before writeFile) |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude                           | plugin-agent-claude/src/application/use-cases/install-skills.ts:137-142                          |
| copilot                          | plugin-agent-copilot/.../install-skills.ts:145-150                                               |
| codex                            | plugin-agent-codex/.../install-skills.ts:128-133                                                 |
| opencode                         | plugin-agent-opencode/.../install-skills.ts:~150-155                                             |
| standard                         | plugin-agent-standard/.../install-skills.ts:~128-133                                             |
| Condition `(file.shared === true |                                                                                                  | baseDir === sharedDir)`covers both shared bundle files and agent fallback writes. Edge (Info I3):`mkdir(skillsTargetDir)` etc. happen before registration, but only non-shared dirs; marker is registered strictly before the first write into sharedDir. Verified. |

## Discrepancies (spec vs code)

D1 (Minor, spec wording, affects ALL 5 plugin specs + dependency contradiction): Each plugin spec requirement "Shared folder ownership and agent placement" says "**After** writing any file into the resolved `sharedFolder` location ..., `install()` MUST call `addSharedOwner(...)`". `skills:shared-folder-owners` (L20) and the code (table in section 9) require/implement registering BEFORE the first shared write. Plugin specs still carry the old ordering.

- spec: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, requirement "Shared folder ownership and agent placement", first paragraph
- code: install-skills.ts, see table above
- Suggested fix: reword to "Before writing the first file into the resolved sharedFolder location ... (see skills:shared-folder-owners)".

D2 (Minor, missing scenario): The new scenario "Owner registered before the first shared write" exists only in `skills:shared-folder-owners` verify.md. None of the 5 plugin verify.md files contain it, although each plugin has a test for it (lines in section 3). Add a scenario to each plugin's verify.md or explicitly state that coverage lives in the skills spec.

D3 (Minor, spec contradiction between plugin specs and owners spec): Plugin specs (claude/copilot/codex/opencode) say a filtered uninstall "MUST NOT remove the shared folder, any file in it, or the owners marker". The owners spec (L44) permits an exception: the explicitly selected agent file for plugins that write agents into the shared folder. In claude/copilot/codex/opencode, when `agents` capability is absent, filtered `options.agents` uninstall deletes `<agent>.agent.md` from the shared folder (e.g. `plugin-agent-claude/.../uninstall-skills.ts:46-50`, codex `:49`). Standard's spec does carry the exception (selected agent file from shared folder), the other four do not. Code behaviour is sensible and matches the owners spec; plugin spec text should add the exception.

D4 (Minor, spec omission): sdk:host-context says rollback errors are "attached as `rollbackErrors`" but the code also handles primitive/null build errors by `Logger.warn` (host-context.ts:173-176; tested host-context.spec.ts:105-130). Spec should mention it (or the `Logger` dependency is undocumented). Code never wraps; build error propagates unchanged: wording consistent otherwise.

D5 (Info): sdk:composition lists `src/` allowed dirs but real tree also holds `core-reexports.ts`, `ports.ts`, `extensions.ts` (top-level files); spec's layer list does not mention top-level files. Harmless.

D6 (Info): `plugin-agent-claude` spec says model comes from `specd-agent.meta.json`; code reads `item.metadata.model` from the skills repository (indirect, same source). OK.

## Scenario -> test gaps (consolidated)

- G2 sdk:composition handler contracts type-level assertion (no type test)
- G3 sdk:host-context "Plugins enabled with an empty plugin list" no test
- G4 sdk:host-context "Broken plugin" does not assert already-initialized plugins destroyed (needs 2-plugin case with 2nd failing)
- G5 owner-before-first-write tests would also pass if registration happened after the first write but before the second
- G6 claude "Agent without model omits the key" no explicit negative assertion
- G7 claude "legacy flat <skill>.md removal" not asserted
- G8 "Uninstall removes selected agent files" / "removes all specd-managed agents (unrelated agent files remain)" untested in claude, copilot, codex, opencode (only standard :456); also `options.agents` filtered uninstall keeping prompt block + marker untested in all 5
- G9 Domain-layer / Frontmatter-type / field-contract / unsupported-key scenarios untested in all 5 plugins (structural)
- G10 "Filtered install also registers the owner" tested for claude (:380) and copilot (:363) only; absent for codex, opencode, standard. "Other owners keep the shared files" absent for standard
- G11 opencode bare+pattern -> `"*": allow` merge untested
- G12 meta-package inclusion scenarios (opencode, standard): no test found
- G13 standard "every Bash pattern uses space style": 2 of 8 skills asserted

## Severity roll-up

- Major: none open.
- Minor: D1, D2, D3, D4, G8 (agent-filter uninstall coverage), G10.
- Info: D5, D6, G2-G7, G9, G11-G13, I1 Logger.warn path, I2 codex trim.

## Verified-fixed since attempt 4

- sdk:composition CLI dependency scenario now matches cli/package.json (sdk + guide + plugin-agent-\* + plugin-manager + schema-std; no core/code-graph).
- Owner marker registered before the first shared write in all five plugins (tests per plugin).
- attachRollbackErrors: no wrapping, original error propagates (identity), rollbackErrors defined enumerable; primitives log via Logger.warn.
- PluginDestroyError re-exported (`sdk/src/index.ts:19`) and asserted same class as plugin-manager (barrel.spec.ts:57-60).
- Claude no-op removed (no leftover conditional), Copilot top-level comma split (`splitTopLevelCommas`, test :594), Codex TOML escape (tests :327,:579,:587), Standard dead branch removed, owners helper imports only node:fs/promises and node:path.
