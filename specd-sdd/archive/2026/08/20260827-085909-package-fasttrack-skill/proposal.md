# Proposal: package-fasttrack-skill

## Motivation

`specd-fasttrack` is currently maintained as a local `.agents` Markdown skill, outside
the package that defines and distributes the rest of the SpecD workflow. That makes its
availability, runtime metadata, and rendered capabilities depend on a single developer
layout instead of the deterministic install path used by Claude, Codex, Copilot, Open
Code, and Agent Skills clients.

The code-first workflow is intentionally more permissive than the normal lifecycle, so
its instructions must remain as rigorous and portable as the other lifecycle skills.
Packaging it now removes a second source of truth while making every supported runtime
receive the same contract, adapted only where that runtime has different capabilities
or frontmatter fields.

## Current behaviour

The only canonical-looking fast-track prompt is
`.agents/skills/specd-fasttrack/SKILL.md`. It contains its own static frontmatter and
long-form workflow guidance, including live journaling in `.specd-exploration.md`,
`changes implementation add` tracking, spec-contract checks, an implementation audit,
and an explicit stop before `/specd-design`.

By contrast, packaged workflow skills are discovered by `FsSkillRepository` from
`packages/skills/templates/skills/<skill-name>/`, rendered by `ResolveBundle`, and
installed by every agent plugin. The repository reads one `SKILL.md.tpl` plus
`skill.meta.json` per directory, validates required capabilities, resolves
`@{{sharedFolder}}/shared.md`, and emits a bundle. `ResolveBundle` supplies safe
project-relative `configPath`, `schemaRef`, and `sharedFolder` variables. Each plugin
enumerates the discovered skills, resolves a bundle with its capability list and
structured frontmatter values, then writes it to its runtime-specific skill directory.

Consequently, fast-track is absent from the package inventory, is not automatically
installed with the other skills, cannot use install-time capability branches, and cannot
receive the runtime-specific frontmatter supplied by the plugins' per-skill maps.

## Proposed solution

Make `specd-fasttrack` a standard packaged skill. Its source will become a template and
metadata pair in `packages/skills/templates/skills/specd-fasttrack/`; the existing
repository discovery and `ResolveBundle` flow will discover and render it without a
parallel distribution mechanism.

The template will keep the code-first safety contract: begin from shared context, create
or select an unscoped change, inspect governing specs before changing code, link every
modified file/symbol to implementation tracking, maintain a journal, audit the resulting
work, and stop for an explicit user decision before formal design. It will reference the
shared workflow instructions rather than duplicating their generic rules, while retaining
the fast-track-only obligations in the template itself.

The journal is a resumability mechanism, not a closing report. The skill will require an
immediate incremental update to `.specd-exploration.md` after every meaningful decision,
scope or contract finding, source edit, implementation-link update, test/debug action,
or audit result. Each entry must record what changed, why, and the affected files or
symbols where applicable. A later consolidation may summarize the journal, but can never
replace live updates; an interrupted session must leave enough current state for a new
agent to continue safely without reconstructing the work from memory or a partial diff.

Each plugin will provide a dedicated `specd-fasttrack` frontmatter entry where its
runtime needs per-skill values, especially the Agent Skills `allowed-tools` declaration.
The package renderer remains the only component that injects frontmatter; plugins pass
structured values and capability identifiers, never prebuilt Markdown or YAML. A normal
unfiltered plugin installation will therefore include fast-track through repository
discovery, while filtered installation and uninstall retain their existing name-based
behaviour.

The obsolete local source will no longer be independently maintained. Any development
copy required by the repository's existing skill synchronization path will be generated
from the package template, so it cannot diverge from the installed skill.

## Specs affected

### New specs

None.

### Modified specs

- `skills:skill-templates-source`: add `specd-fasttrack` to the standard-template
  inventory and define its metadata, shared-context reference, capability-aware
  rendering, and absence of static frontmatter.
  - Depends on (added): none.
  - Depends on (removed): none.
- `skills:skill-repository`: require standard-skill discovery and bundle resolution to
  expose the packaged fast-track skill with its metadata and shared file.
  - Depends on (added): none.
  - Depends on (removed): none.
- `skills:resolve-bundle`: require resolving fast-track to apply the existing built-in
  variables and capability/frontmatter pipeline without a special-case resolver.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-claude:plugin-agent`: require Claude installation to render and install
  fast-track using Claude capabilities and structured skill frontmatter.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-copilot:plugin-agent`: require Copilot installation to render and
  install fast-track with only Copilot-supported frontmatter and capabilities.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-codex:plugin-agent`: require Codex installation to render and install
  fast-track under `.codex/skills/specd-fasttrack/` with Codex-supported metadata.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-opencode:plugin-agent`: require Open Code installation to render and
  install fast-track using its MCP, agents, and frontmatter capabilities.
  - Depends on (added): none.
  - Depends on (removed): none.
- `plugin-agent-standard:plugin-agent`: require Agent Skills Standard installation to
  render and install fast-track with the required `allowed-tools` contract.
  - Depends on (added): none.
  - Depends on (removed): none.

## Impact

The change adds one directory to the skills template inventory and makes it visible to
the existing `FsSkillRepository.list()` and `get()` directory scans. It flows through
`ResolveBundle.execute()` and the `InstallSkills` use cases in all five agent plugins;
the plugins already select all discovered standard skills when no explicit filter is
given, so no new installation orchestration or public API is needed.

Affected implementation and test areas are the skills template workflow and repository
tests, the five plugin frontmatter maps, and their installation tests. The code graph
classifies the template-source spec's dependent impact as MEDIUM and identifies the
skills repository plus the Codex, Copilot, and Standard installation tests directly;
the remaining plugins share the same discovery architecture and require equivalent
coverage. No data model, network service, external dependency, or read-only workspace
is involved.

## Technical context

`SkillTemplateMetadata` and `SkillTemplateMetadataReader` provide the metadata boundary
for every standard-skill directory. The established metadata shape declares `kind`,
`supportedCapabilities`, `requiredCapabilities`, and `requiredSharedTemplates`; existing
workflow skills support `mcp`, `agents`, and `frontmatter`, require no optional runtime
capability, and declare `shared.md` as their shared dependency. The new skill follows
that model and must use the project-relative `@{{sharedFolder}}/shared.md` reference.

`FsSkillRepository` discovers standard skills by listing template directories rather than
an enum, normalizes `SKILL.md.tpl` to `SKILL.md`, validates capabilities before rendering,
and routes shared files separately from skill-local files. `ResolveBundle` centralizes
the safe relative variables; fast-track must rely on it rather than resolve paths or
frontmatter itself.

All five plugins call `repository.list()`, use `ResolveBundle`, and inject structured
`frontmatter` through their existing `skillFrontmatter` maps. Capability differences are
intentional: Codex, Claude, and Open Code expose MCP, delegation, and frontmatter;
Copilot exposes frontmatter and delegation; Agent Skills Standard exposes only
frontmatter. The template must make MCP/delegation instructions conditional where they
cannot be performed, rather than claiming universal support. Each runtime must emit only
its documented frontmatter fields; frontmatter is never added to shared files.

Keeping a local source or adding an independent plugin path was evaluated and rejected:
both would bypass metadata validation, deterministic single-pass rendering, capability
filtering, and the existing install/uninstall selection model.

The original prompt already mentioned live journaling, but its migration must make the
timing and resume guarantee normative and unambiguous: journal updates happen during the
work, including intermediate work that may later be committed, discarded, or paused.

## Open questions

None. The migration uses the existing generic discovery and resolver path; detailed
prompt wording, concrete frontmatter values, and test cases are implementation/design
decisions constrained by the contracts above, not direction-changing choices.
