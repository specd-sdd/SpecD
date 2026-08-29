# Vendor B Audit — OpenCode and Standard

## Requirements Summary

Audited the change previews for `plugin-agent-opencode:plugin-agent` and
`plugin-agent-standard:plugin-agent`, concentrating on the new Fast-track requirement.
Both adapters must include `specd-fasttrack` in an unfiltered standard-skill install,
resolve it through `ResolveBundle`, pass their supported capabilities and structured
frontmatter, write it to the vendor-specific skill directory, and retain only the
capability-aware content available to that vendor.

OpenCode's declared capabilities are `mcp`, `agents`, and `frontmatter`; its output is
therefore expected to retain both optional workflow branches. Standard declares only
`frontmatter`; its output must omit the MCP and agent-delegation branches while retaining
the mandatory live journal rule. The dependency contracts also require `ResolveBundle`
instead of direct repository bundle access, safe default shared-folder handling, and
integration tests using temporary filesystems.

## Implementation Status

Conformant.

- `packages/plugin-agent-opencode/src/domain/frontmatter/index.ts` contains a
  `specd-fasttrack` entry with only OpenCode-supported `name` and `description` fields.
- `packages/plugin-agent-standard/src/domain/frontmatter/index.ts` contains the
  equivalent Standard entry and its permitted `allowed-tools` value.
- Both `InstallSkills.execute()` implementations derive the default request from
  `repository.list()` filtered to `kind === 'skill'`, so an unfiltered install includes
  `specd-fasttrack`.
- Both flows construct `ResolveBundle` and pass the appropriate literal capability set
  plus the selected structured frontmatter. No direct `SkillRepository.getBundle()` call
  occurs in either adapter.
- OpenCode writes non-shared skill files under `.opencode/skills/<name>/`; Standard
  writes them under `.agents/skills/<name>/`.
- The canonical Fast-track template has capability gates for MCP and agents and contains
  the mandatory append-before-next-meaningful-action journal rule.

An ad-hoc, unmocked temporary-project execution imported both current adapter sources,
called `install(config)` with no skill filter, and read the generated files. It confirmed:

- both default installs reported `specd-fasttrack` installed;
- files existed at the required OpenCode and Standard destinations;
- OpenCode retained MCP and agent workflow branches;
- Standard omitted both branches;
- both outputs contained the live journal rule and generated frontmatter.

## Discrepancies

None found. The active change deltas are consistent with the inspected implementation
and with the relevant `skills:skill-repository` and `skills:resolve-bundle` contracts.

## Test Coverage

`pnpm --filter @specd/plugin-agent-opencode --filter @specd/plugin-agent-standard test -- install-skills.spec.ts`
passed: 10 tests across both packages.

The persistent adapter tests use temporary project roots and assert destination paths,
frontmatter/capability context passed to resolution, and the capability-specific rendered
content. The separate unmocked default-install check described above exercised the actual
skill template and filesystem routing for both adapters successfully.

## Missing Tests

Non-blocking coverage gap: the committed Fast-track adapter tests mock the repository and
synthesize its resolved `SKILL.md`; they do not persist an end-to-end test that uses the
real `@specd/skills` template repository with an unfiltered install. The manual runtime
check closes this audit's behavioral verification, but a future regression test should
make that real-template default-install assertion permanent.

## Spec Dependency Chain

`plugin-agent-opencode:plugin-agent` and `plugin-agent-standard:plugin-agent`
→ `skills:skill-repository` / `skills:resolve-bundle`
→ `skills:skill-bundle`, `skills:skill-templates-source`, and
`skills:skill-repository-port`.

The plugins additionally depend directly on `core:config`,
`plugin-manager:agent-plugin-type`, `skills:agents`, and
`skills:agent-instruction-template`. Project-wide `default:_global/testing` supports the
temporary-filesystem integration-test approach, and `default:_global/conventions` is
consistent with the inspected named ESM exports and strict TypeScript source.

## Summary counts

- Change-specific requirements assessed: 2
- Direct plugin dependency contracts checked: 7 per adapter
- Persistent automated tests passed: 10
- Unmocked default-install runtime checks passed: 2 adapters
- Functional discrepancies: 0
- Non-blocking missing-test findings: 1
