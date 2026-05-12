# Proposal: shared-skill-bundle-targets

## Motivation

Shared skill guidance is currently duplicated into every installed skill directory, which makes updates noisy and prevents agent plugins from installing one canonical shared resource. The installation contract needs a minimal way to route shared bundle files separately while preserving today's single-directory behavior for existing consumers.

## Current behaviour

`@specd/skills` stores shared templates under `packages/skills/templates/shared/` and associates them with consuming skills through metadata. During bundle resolution those shared files are appended to `SkillBundle.files` as ordinary `ResolvedFile` entries, so installers cannot tell whether a file came from a skill directory or from the shared template source.

Each agent plugin then writes every bundle file under the skill-specific install directory, for example `.codex/skills/<skill>/shared.md` or `.opencode/skills/<skill>/shared.md`. Markdown files are treated uniformly, so shared markdown files also follow the same frontmatter injection path as skill-owned markdown files.

Uninstall behavior is also too broad today: full uninstall can remove the entire agent skills root, which may include non-specd skills managed by users or other tooling.

## Proposed solution

Extend the skill bundle contract so resolved files can explicitly indicate whether they are shared. Extend bundle installation semantics so callers can provide both a normal target directory and an optional shared target directory; shared files write to the shared target when present and otherwise fall back to the normal target. Agent plugins can then place shared files under a single `_specd-shared/` directory beneath their agent-specific skills root while leaving regular skill files under each skill directory.

Refine uninstall semantics so plugin uninstall removes only specd-managed skill directories (and specd shared resources) instead of deleting the entire agent skills root. This avoids removing user-created or third-party skills.

This keeps the design small: no content-addressed store, manifest resolver, symlink strategy, or versioned shared cache is introduced. Those remain possible future improvements if multiple shared resources or conflict detection require them.

## Specs affected

### New specs

_none_

### Modified specs

- `skills:skill-bundle`: add shared-file metadata to `ResolvedFile` and define two-target install/uninstall routing with fallback to the normal target.
  - Depends on (added): none
- `skills:skill-repository-port`: clarify that repository-provided bundles preserve whether files came from shared template metadata.
  - Depends on (added): none
- `skills:skill-repository-infra`: require shared files loaded from `templates/shared/` to be marked as shared when added to a resolved bundle.
  - Depends on (added): none
- `skills:resolve-bundle`: require variable substitution to preserve resolved-file shared metadata.
  - Depends on (added): none
- `plugin-manager:agent-plugin-type`: clarify the agent install contract only if shared install paths are exposed through plugin options or install results; otherwise this spec can receive a no-op delta.
  - Depends on (added): none
- `plugin-agent-codex:plugin-agent`: route files marked shared to `.codex/skills/_specd-shared/` and avoid treating shared markdown as a skill file.
  - Depends on (added): `skills:skill-bundle`
- `plugin-agent-claude:plugin-agent`: route files marked shared to `.claude/skills/_specd-shared/` and avoid treating shared markdown as a skill file.
  - Depends on (added): `skills:skill-bundle`
- `plugin-agent-copilot:plugin-agent`: route files marked shared to `.github/skills/_specd-shared/` and avoid treating shared markdown as a skill file.
  - Depends on (added): `skills:skill-bundle`
- `plugin-agent-opencode:plugin-agent`: route files marked shared to `.opencode/skills/_specd-shared/` and avoid treating shared markdown as a skill file.
  - Depends on (added): `skills:skill-bundle`

## Impact

Affected code areas include the skill bundle domain types, the filesystem skill repository implementation, the resolve-bundle use case, and all four agent plugin install/uninstall flows. The existing shared template source under `packages/skills/templates/shared/` remains the source of shared file content.

Installed skill output changes from duplicated per-skill `shared.md` files toward a single shared file under an agent-specific `_specd-shared/` directory. Skill templates that currently say `Read @shared.md before doing anything.` will need to reference the shared relative location, such as `Read @../_specd-shared/shared.md before doing anything.`

## Technical context

The user explicitly chose the minimal model: mark bundle files as shared and support two install directories, with the shared directory optional and defaulting to the normal directory. Sharedness should be explicit metadata on resolved bundle files rather than inferred from filenames such as `shared.md`.

The current `ResolvedFile` shape is only `filename` plus `content`, and `SkillBundle.install()` accepts only a single `targetDir`. The proposed direction discussed was an optional marker such as `shared?: boolean` and an install input that carries `targetDir` plus `sharedTargetDir?: string`.

Agent Skills documentation reviewed during discovery did not identify a portable standard for cross-skill shared directories. However, clients generally discover skill directories by the presence of `SKILL.md`, so `_specd-shared/` without a `SKILL.md` should not be discovered as a skill. This makes `_specd-shared/` a specd installation convention rather than a general Agent Skills standard.

Rejected alternatives were a content-addressed store, manifest-based resolution, symlink or hardlink strategies, and continuing to duplicate the full shared file in every skill. A local per-skill stub remains a possible fallback for clients that cannot resolve `..` paths, but it is not part of the minimal preferred path.

## Open questions

_none_
