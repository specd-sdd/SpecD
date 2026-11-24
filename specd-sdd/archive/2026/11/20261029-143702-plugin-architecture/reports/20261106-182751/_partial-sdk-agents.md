# Audit attempt 8 - batch sdk-agents (plugin-architecture)

Specs: sdk:composition, sdk:host-context, plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.
Baseline: vitest green: skills 139, claude 73, copilot 72, codex 109, opencode 76, standard 73, sdk 129. No plugin/skills/core dist is stale.

## Verdict

0 critical, 0 major, 7 minor, 6 test gaps (weak/missing). Attempt-7 C1 (filtered uninstall deleting any name incl. `..`) is FIXED and proven by probes.

## Probe results (real `create().install()/uninstallWithResult()` on temp projects; scripts in scratchpad probe.mjs..probe6.mjs)

All five plugins (claude, copilot, codex, opencode, standard):

- Hostile filters (36 names x 5 modes: skills, agents, both, skills with capabilities [], agents with capabilities []): `..`, `.`, empty, `../x`, `../../x`, `../outside/victim`, absolute path to victim dir and file, `a\..\..\x`, `a/../../x`, `specd/..`, `specd/../..`, `name\0x`, `__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`, trailing space or newline, `*`, `**`, `.owners.json`, `shared`, `shared.md`, a user skill, a user agent, a user symlink inside the skills dir (`evil-link`, `evil-link2.md`), `specd-new/../specd`, `specd-new/`.
  Result: project tree + outside tree + a sibling file byte-identical before/after; every name is reported in `skipped`. 0 failures.
- A MANAGED name that is a symlink (skill dir to an outside dir; flat `<skill>.md` to an outside file; agent file to an outside file): filtered and full uninstall remove only the link, the outside targets are intact (fs.rm does not follow links).
- Full uninstall keeps an unrelated file in the skills dir; empty `skills: []`/`agents: []` behaves as a full uninstall (leaves empty `.claude/skills`, `.claude/agents` dirs - not required to be removed).
- Install with hostile `skills`/`agents` names: all land in `skipped: item not found` (`repository.get` validates against listed directories); nothing written.
- `selectManagedNames` with `__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`, `prototype`, `length`, `0`, `includes`, `at`: all skipped (uses `Array.includes` on the managed array, no object-key lookup). No prototype slip-through. Non-string entries (`1`, `null`, `undefined`, `{}`) THROW TypeError (fail-closed, nothing deleted); an array entry `['specd']` is skipped.
- Claude real render: `allowed-tools`, `argument-hint`, `disable-model-invocation: true` (fast-track), no snake_case key; agent keeps `tools`/`model`. Copilot: tools as YAML list; Codex: TOML agent; OpenCode: `mode: subagent` + `permission` map; Standard: `allowed-tools` space-separated, agents `<name>.agent.md` in the shared folder.

## Mutation results (mutants only on copies in scratchpad/sa-mut)

Claude 41 mutants; killed all except: M27 (agents-only filter reports a bogus skipped entry) and M17/M26/M30 (no-op or equivalent, my own pattern errors). Copilot and Codex generic set (~30): survivors only G10b (filtered uninstall no longer removes legacy flat `<skill>.md`) and G27. See "Test gaps". OpenCode and Standard: no survivors (G4/G38/G39 N/A for standard, which has no runtime agents dir or capability switch). Claude G10b and G27 also survive.

## Per-spec status

### sdk:composition - all requirements OK

- Package identity: deps exactly core, code-graph, plugin-manager (packages/sdk/package.json). Test packages/sdk/test/composition/composition.spec.ts:8, package-boundary.spec.ts:12/24.
- Layer structure: src/{composition,orchestration,presentation,shared,domain/errors}; no infrastructure. package-boundary.spec.ts:56. `exports` has `.`, `./ports`, `./extensions` pointing to dist. barrel.spec.ts:286, 311, 321.
- Barrel: all listed names present (index.ts, core-reexports.ts:4 createConfigWriter, :531-532 PLUGIN_NAME_REGEX/isPluginName, :692 InvalidCheckIdError). Removed APIs absent: barrel.spec.ts:137. Plugin error identity: barrel.spec.ts:74/96. No export-star: :113.
- Host-adapter exports, no lock/IPC: barrel.spec.ts:205/216. SDK_VERSION :44; codeGraphVersion :299.
- Discrepancy (minor, spec wording vs code): verify scenario "SDK tracks revised metadata materialization surface" says `MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState` "are available"; code (core-reexports.ts:191-208) re-exports the classes TYPE-ONLY and barrel.spec.ts:177-196 asserts `name in sdk === false` for them. Test codifies a reading narrower than the spec wording; the spec should say "types and create\* factories".
- Minor/info: spec host-context says `createKernelBuilder` from `@specd/core`; code imports `@specd/core/extensions` (host-context.ts:10). Both subpaths export it (core public.ts:6, extensions.ts:5); harmless.

### sdk:host-context - all requirements OK

- Shape/dispose: host-context.ts:96-114 (`dispose` delegates to `kernel.dispose`, same function as `[Symbol.asyncDispose]`). Tests host-context.spec.ts:327,343,352,361,371,378,389,402; e2e host-context-e2e.spec.ts:104-162.
- createSdkContext: order register then build (spec test :61 checks invocationCallOrder); `plugins:false` :74; init failure :80 + e2e :114/130; build failure disposes :87; dispose error not masking, `rollbackErrors` :103/417/457 and real PluginDestroyError host-context-rollback.spec.ts:61/84; primitive/null/number/frozen: :116 it.each, :431; pluginHandlers :87; graph options :140; new provider per call :150.
- openSpecdHost: mixed inputs rejected :236; startDir :229; configPath :224; fallback only on ConfigNotFoundError, never with configPath :246-:318; warnings stay on config :173/185; plugins option forwarded :219.
- Config mutation boundary: :335.
- Weak (minor): "Plugins enabled with an empty plugin list" has no dedicated test (the default-path test mocks registerPlugins; the real empty-list behaviour lives in plugin-manager). Limitation documented in code (Logger null implementation drops the warn when the build fails before the logger is set) is spec-consistent ("when no logger implementation has been configured they are not emitted").

### skills:shared-folder-owners - all requirements OK

- Code: packages/skills/src/application/shared-folder-owners.ts (add :40, remove :64, rmdir :93), select-managed-names.ts.
- Scenario tests: sorted/dedup shared-folder-owners.spec.ts:29; corrupt marker :142; first owner :38; idempotent byte-identical :46; duplicates normalised :67-:83; invalid replaced :56; wrong shape :112/:131; owners remain :152; last owner :162; no marker :171; non-owner :184; empty folder :196; foreign file :204; missing :214; EACCES propagates shared-folder-owners-eacces.spec.ts:20. Uninstall protocol scenarios are in each plugin's install-skills/shared-folder-ownership specs (below). "Owner registered before first shared write" claude install-skills.spec.ts:597 (and same file in the others).
- Minor hazards (spec-consistent, noted): (a) a symlinked `.owners.json` is followed on write (probe6 B: the outside file is rewritten with the merged owners); (b) a symlinked shared folder: full uninstall deletes the files then `rmdir` throws ENOTDIR (probe6 A) - spec says other errors propagate, but the uninstall has already done its work and rejects; (c) `readMarkerFile` maps EACCES/EISDIR to "absent", then addSharedOwner overwrites (spec: unreadable = no marker).

### skills resolveSharedFolder (cross-spec, used by all plugins) - hazards

- `sharedFolder` `.`, `./`, `''`, `\` resolve to the PROJECT ROOT (containment check `path.relative` = '' passes, domain/shared-folder.ts:34-38). Probe3: install writes `shared.md` and `.owners.json` into the project root; full uninstall removes them (only managed names, so no foreign loss; rmdir(root) is swallowed ENOTEMPTY). Recommend rejecting an empty relative path. minor.
- `..foo` (a valid directory name) is rejected because `containment.startsWith('..')` (false positive); an absolute path inside the root is accepted but `relativePath` then holds the ABSOLUTE path (probe2) although the doc says "project-relative POSIX path exposed to templates". Symlink escape not checked (lexical containment only). minor.

### plugin-agent-claude:plugin-agent - all requirements OK

- Requirements verified in code: install-skills.ts (capabilities `['mcp','agents','frontmatter']` :53; addSharedOwner before the first shared write :133-137; agents dir by capability :58; hyphen keymap SKILL_YAML_KEYS :178), uninstall-skills.ts (managed-name validation :56-69; full uninstall both agent locations :76-90; owner protocol :84-90), claude-plugin.ts (`uninstallWithResult`), index.ts (manifest validation).
- Scenario -> test: factory create.spec.ts:45/62/74/86/97/109; install routing install-skills.spec.ts:143; agent frontmatter :235; model :557, no model :638; shared fallback :499; prompt block :353; owners :388/408/430/448/465/481; owner-before-write :597; legacy flat :677; real render + manual-only fast-track real-pipeline.spec.ts:50-99; hyphen keys skill-frontmatter-keys.spec.ts:68; safety uninstall-safety.spec.ts:162-274; both agent locations :284; sharedFolder override :311/:336; skipped on install :355; shared-folder agents ownership shared-folder-ownership.spec.ts:144-263; filtered keeps block/marker agent-lifecycle.spec.ts:123/182/223.
- Divergence (design, minor/info): install with only `skills` still installs ALL agents, with only `agents` ALL skills (probe4: 3 vs 9 items). Matches the `agent-plugin-type` contract "omit = all", but filtered uninstall is the opposite (only the selected kind). Intentional per both specs, yet asymmetric; worth one sentence in the specs.
- Mutants surviving / weak tests: see test gaps T1-T4.

### plugin-agent-copilot:plugin-agent - all requirements OK

- Capabilities `['frontmatter','agents']`; agents `.github/agents/<name>.agent.md` with `tools` as YAML list via splitTopLevelCommas (install-skills.ts:73-80); fast-track `disable-model-invocation: true` (frontmatter/index.ts). Tests mirror claude; tools split agent-tools-split.spec.ts (copilot test dir).
- Code smell (minor): uninstall-skills.ts:43 `supportsAgents ? '${agent}.agent.md' : '${agent}.agent.md'` identical branches (dead conditional; behaviour correct). install-skills.ts last line re-exports splitTopLevelCommas (stray).

### plugin-agent-codex:plugin-agent - all requirements OK

- TOML agents `.codex/agents/<name>.toml`, escaping of backslash, `"""` and control chars (install-skills.ts escapeTomlBasicMultiline) tested in toml-escaping.spec.ts; frontmatter name+description only; AGENTS.md block with `codex`; fallback `.agent.md` in shared folder when capability missing. Full uninstall removes `.toml` and shared `.agent.md`.

### plugin-agent-opencode:plugin-agent - all requirements OK

- `mode: subagent` + `permission` map (toOpenCodePermission, permission.spec.ts:5-20: comma inside parentheses, several patterns, bare+patterns -> `*`). Meta-package + wizard (cli project-init.spec.ts:162, :381-385; meta-package.spec.ts).
- Minor: install calls `removeSpecdBlock(agentsMdPath,'opencode')` before `injectSpecdBlock` (install-skills.ts ~l.158). Spec only requires injectSpecdBlock to purge legacy markers; the extra remove+inject can relocate/rewrite the block and is not described by the spec (other plugins do not do it).

### plugin-agent-standard:plugin-agent - all requirements OK

- Capabilities `['frontmatter']`, agents always `<name>.agent.md` in the shared folder, `allowed-tools` space-separated with `Bash(x *)` style, specd-compliance includes node and pnpm (frontmatter/index.ts:30-35). Wizard list cli project-init.spec.ts:381-385; meta-package.spec.ts. Full uninstall has no runtime agents dir (correct).

## Test gaps (weak or missing)

- T1 (minor, all 5 plugins): agents-only filtered uninstall never asserts `skipped: []` (mutant: skills selection receives the agent names -> bogus skipped entries) - survived in claude, copilot, codex (opencode and standard kill it). uninstall-safety.spec.ts:256 only checks a skills-only filter.
- T2 (minor, claude, copilot, codex; opencode/standard kill it): filtered uninstall no longer removing the legacy flat `<skill>.md` survives; only the full-uninstall path is tested for legacy flat files (uninstall-safety.spec.ts:416).
- T3 (minor): no test feeds `__proto__`/`constructor` names to selectManagedNames or a plugin filter (implementation is safe via Array.includes; a Set/object refactor could regress). Non-string entries untested.
- T4 (minor): scenario "Unsupported Claude metadata stays out of the value collection" and "Frontmatter values cover supported metadata" are type-level only; no runtime assertion.
- T5 (minor): fast-track "journal-resumability" at plugin level is asserted only against a mocked bundle string (claude install-skills.spec.ts:176); real render is covered only in skills/test/template-workflow.spec.ts:36 (not through the plugin).
- T6 (minor): no test for sharedFolder `.`/empty/absolute-inside-root or symlinked shared/marker (hazards above).

## Contradictions with dependency/global specs

None found. Only wording items: sdk host-context "createKernelBuilder from @specd/core" vs `/extensions` import; sdk verify "MaterializeSpecMetadata ... available" vs type-only export.
