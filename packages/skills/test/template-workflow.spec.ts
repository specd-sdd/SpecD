import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const templatesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

function readTemplate(...parts: string[]): string {
  return readFileSync(join(templatesRoot, ...parts), 'utf8')
}

function complianceDecision(content: string, mode: '`change`' | '`delegated`'): string[] {
  const row = content.split('\n').find((line) => line.startsWith(`| ${mode} |`))
  if (!row) throw new Error(`Missing compliance decision row for ${mode}`)
  return row
    .split('|')
    .slice(2, -1)
    .map((cell) => cell.trim())
}

describe('workflow skill templates', () => {
  it('defines fast-track as a frontmatter-free, resumable standard template', () => {
    const content = readTemplate('skills', 'specd-fasttrack', 'SKILL.md.tpl')
    const metadata = JSON.parse(
      readTemplate('skills', 'specd-fasttrack', 'skill.meta.json'),
    ) as Record<string, unknown>

    expect(content.startsWith('---\n')).toBe(false)
    expect(content).toContain('@{{sharedFolder}}/shared.md')
    expect(content).toContain('## Activation boundary')
    expect(content).toContain('Use `/specd-fasttrack` only when the user explicitly\ninvokes it.')
    expect(content).toContain('Never select or invoke this skill for normal specd work')
    expect(content).toContain("**STOP.** Wait for the user's explicit selection.")
    expect(content).toContain('Blast Radius & Dependents Regression Search')
    expect(content).not.toMatch(/downstream dependents|downstream regression/i)
    expect(content).toContain('Mandatory live journal rule')
    expect(content).toContain('after **every** decision, scope or contract finding,')
    expect(content).toContain(
      'source edit, implementation-link update, test or debugging action/result',
    )
    expect(content).toContain('A final audit or\nconsolidation summary supplements')
    expect(content).toContain('specd project status --context --format toon')
    expect(content).toContain('specd project context-specs --format toon')
    expect(content).toContain('specd project context-specs --workspace <workspace> --format toon')
    expect(content).toContain('specd specs context <workspace:spec-id> --follow-deps --format text')
    expect(content).toContain('First run file impact and inspect its `coveringSpecs` result.')
    expect(content).toContain(
      'it may be empty, so never assume\nthat a workspace has applicable specs',
    )
    expect(content).not.toContain('specd specs show')
    expect(content).toContain('`specs context` is the only allowed spec-reading surface')
    expect(content).toContain('VERBATIM (EXACTLY AS-IS)')
    expect(content).toContain('> **MANDATORY DIRECTIVES FOR `/specd-design`**:')
    expect(content).toContain('8. **Codebase-Wide Adoption & Affected Areas (MUST)**:')
    expect(content).toContain('already marked as completed (`- [x]`)')
    expect(content).toContain('## Consolidation & Audit Summary')
    expect(content).toContain('MANDATORY STOP RULES')
    expect(content).toContain('Do NOT autonomously invoke, launch, or execute `/specd-design`.')
    expect(metadata).toEqual({
      kind: 'skill',
      supportedCapabilities: ['mcp', 'agents', 'frontmatter'],
      requiredCapabilities: [],
      requiredSharedTemplates: ['shared.md'],
    })
  })

  it('does not instruct removed metadata-status scans or write-metadata flows', () => {
    const content = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(content).not.toMatch(/specd specs list --metadata-status/)
    expect(content).not.toMatch(/generate-metadata --all --write/)
    expect(content).not.toMatch(/specd specs write-metadata/)
  })

  it('optimizer agent templates use the top-level project status gate', () => {
    for (const agent of ['specd-spec-context-optimizer', 'specd-project-context-optimizer']) {
      const content = readTemplate('agents', agent, 'SPECD-AGENT.md.tpl')
      expect(content).toContain('specd project status --format toon')
      expect(content).toContain('top-level `llmOptimizedContext` field')
      expect(content).not.toContain('specd specs metadata <spec-id> --format json')
    }
  })

  it('spec optimizer template uses direct persistence options without mixed forms or metadata regeneration', () => {
    const content = readTemplate('agents', 'specd-spec-context-optimizer', 'SPECD-AGENT.md.tpl')
    expect(content).toContain(
      'specd specs optimizations set <spec-id> --optimized-description "<punchy sentence>" --optimized-context "<optimized Markdown>"',
    )
    expect(content).toContain('You MAY omit one direct option when only one field needs refresh.')
    expect(content).toContain('Do not combine either direct option with `--input`.')
    expect(content).toContain('Do **not** run `specd specs generate-metadata` afterward')
  })

  it('project optimizer template retains project-scoped persistence', () => {
    const content = readTemplate('agents', 'specd-project-context-optimizer', 'SPECD-AGENT.md.tpl')
    expect(content).toContain('specd project status --format toon')
    expect(content).toContain('top-level `llmOptimizedContext` field')
    expect(content).toContain('specd project update-metadata --optimized-context')
    expect(content).not.toContain('specd specs optimizations set')
    expect(content).toContain('Do **not** run routine `specd specs generate-metadata`')
  })

  it('shared guidance defines exact show/context/metadata roles', () => {
    const content = readTemplate('shared', 'shared.md.tpl')
    expect(content).toContain('`specd specs show <spec-id>` for exact raw artifact content')
    expect(content).toContain(
      '`specd specs context <spec-id>` for semantic working context, including section filtering, dependency traversal, and optimized-content preference.',
    )
    expect(content).toContain(
      '`specd specs metadata <spec-id>` only for the normalized metadata projection and materialization diagnostics such as `source`, `regenerated`, and warnings.',
    )
    expect(content).toContain(
      'Do not treat `specd specs metadata` as the default context-loading command or as a source of effective project configuration.',
    )
  })

  it('archive guidance keeps metadata diagnostics separate from optimization gating', () => {
    const content = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(content).toContain('specd specs metadata <spec-id> --format json')
    expect(content).toContain('contains top-level `llmOptimizedContext`')
    expect(content).toContain('If top-level `llmOptimizedContext` is `true`')
    expect(content).not.toContain('approvals.llmOptimized')
  })

  it('does not teach pending parking as the happy-path wait', () => {
    const verify = readTemplate('skills', 'specd-verify', 'SKILL.md.tpl')
    expect(verify).toContain('stay in `done`')
    expect(verify).toContain('approve signoff')
    expect(verify).not.toMatch(/pending-signoff/)
    expect(verify).not.toMatch(/change transition.*pending/)

    const implement = readTemplate('skills', 'specd-implement', 'SKILL.md.tpl')
    expect(implement).toContain('stay in `ready`')
    expect(implement).toContain('Do **not** `transition implementing`')

    const shared = readTemplate('shared', 'shared.md.tpl')
    expect(shared).toContain('**stays** in `ready` or `done`')
    expect(shared).not.toMatch(/reaches `pending-spec-approval`/)
    expect(shared).toContain('Do **not**\nlist `pending-spec-approval`')

    const neu = readTemplate('skills', 'specd-new', 'SKILL.md.tpl')
    expect(neu).toContain('Drain only:')
    expect(neu).toContain('If spec gate on and unsatisfied')

    const design = readTemplate('skills', 'specd-design', 'SKILL.md.tpl')
    expect(design).toContain('Stay in `ready`')
    expect(design).toContain('approve spec')
    expect(design).not.toMatch(/pending-spec-approval/)
    expect(design).not.toMatch(/change transition.*pending/)

    const entry = readTemplate('skills', 'specd', 'SKILL.md.tpl')
    expect(entry).toContain('routes to the right skill')
    expect(entry).not.toMatch(/signoff/)
    expect(entry).not.toMatch(/pending-spec-approval/)
    expect(entry).not.toMatch(/approve spec/)

    const archive = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(archive).toContain('archivable')
    expect(archive).toContain('archiving')
    expect(archive).toContain('approve signoff')
    expect(archive).not.toMatch(/pending-signoff/)
    expect(archive).not.toMatch(/change transition.*pending/)

    expect(entry).toMatch(/next action/)
    expect(entry).toMatch(/command/)
    expect(entry).not.toMatch(/LifecycleEngine/)
    const created = readTemplate('skills', 'specd-new', 'SKILL.md.tpl')
    expect(created).toContain('/specd-archive')
    expect(created).toContain('archivable')
    expect(created).not.toMatch(/LifecycleEngine/)

    expect(shared).toContain('MUST NOT run `source.post` on `along` backward')
  })

  it('verify drains open implementation files; implement gates verify on zero open', () => {
    const shared = readTemplate('shared', 'shared.md.tpl')
    expect(shared).toContain('specd changes implementation list <name>')
    expect(shared).toContain('specd changes implementation resolve <name>')
    expect(shared).toContain('specd changes implementation ignore <name>')
    expect(shared).toContain('**`resolve`**')
    expect(shared).toContain('**`ignore`**')
    expect(shared).not.toMatch(/Exception — open implementation files/)
    expect(shared).toContain('top-level')
    expect(shared).toContain('No catch-all dumps')

    const verify = readTemplate('skills', 'specd-verify', 'SKILL.md.tpl')
    expect(verify).toContain('IMPLEMENTATION_STATE')
    expect(verify).toContain('drain tracking')
    expect(verify).toContain('shared.md')
    expect(verify).toContain('Do **not** redirect to `/specd-implement` solely for open files')
    expect(verify).not.toMatch(/If it fails, follow the \*\*Repair Guide\*\* output\.\n/)

    const implement = readTemplate('skills', 'specd-implement', 'SKILL.md.tpl')
    expect(implement).toContain('zero open')
    expect(implement).toContain('implementation list')
    expect(implement).toContain('do **not** tell the user to run `/specd-verify` yet')
    expect(implement).toContain(
      'Never recommend `/specd-verify` while `implementation list` still shows `open` files',
    )
    expect(implement).toContain('top-level')
    expect(implement).toContain('Do **not** link local variables')
    expect(implement).toContain('not a catch-all')
  })

  it('archive skips only pre hooks so post run inside archive', () => {
    const archive = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(archive).toContain('--skip-hooks pre')
    expect(archive).not.toMatch(/archive <name> --skip-hooks all/)
    expect(archive).not.toMatch(/```bash\n[^\n]*run-hooks <name> archiving --phase post/)
    expect(archive).toContain('hook-instruction <name> archiving --phase post')
  })

  it('design skill does not treat the text review header as a file list', () => {
    const design = readTemplate('skills', 'specd-design', 'SKILL.md.tpl')
    expect(design).toContain('review: required: yes')
    expect(design).not.toMatch(/listed under `review:`/)
    expect(design).toContain('artifacts (details):')
    expect(design).toContain('affectedArtifacts')
  })

  it('does not treat invalidation overlap as OVERLAP_CONFLICT on hop skills', () => {
    for (const skill of ['specd-design', 'specd-implement', 'specd-verify', 'specd-new'] as const) {
      const template = readTemplate('skills', skill, 'SKILL.md.tpl')
      const typical = template.match(/\(e\.g\.[\s\S]*?\)/)
      expect(typical?.[0] ?? '').not.toContain('OVERLAP_CONFLICT')
      expect(template).toContain('spec-overlap-conflict')
      expect(template).toContain('/specd-design')
      expect(template).toContain('not `--allow-overlap`')
    }

    const archive = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(archive.match(/\(e\.g\.[\s\S]*?\)/)?.[0] ?? '').toContain('OVERLAP_CONFLICT')
    expect(archive).toContain('--allow-overlap')
    expect(archive).toContain('spec-overlap-conflict')
    expect(archive).toContain('do not use `--allow-overlap`')
  })

  it('teaches canonical reconciliation instead of hand-rolled invalidation', () => {
    const shared = readTemplate('shared', 'shared.md.tpl')
    expect(shared).toContain('materialized validity projections')
    expect(shared).toContain('Do not calculate fingerprints')
    expect(shared).toContain('restart-verification flag')
    expect(shared).toContain('`artifacts: none` waives reopening')
    expect(shared).toContain('`workflow: preserve` permits in-place semantic review')
    expect(shared).toContain('`workflow: redesign` plus unresolved non-task drift')
    expect(shared).toContain('not semantic review, approval renewal, or verification renewal')
    expect(shared).toContain('returns to `designing`')
    expect(shared).toContain('later than `done`')
    expect(shared).toContain('Verification staleness alone never moves lifecycle state')
    expect(shared).toContain('specd changes verification start <name>')
    expect(shared).toContain('specd changes verification complete <name>')
    expect(shared).toContain('specd changes verification invalidate <name> --reason "<text>"')
    expect(shared).toContain('hasTasks')
    expect(shared).toContain('Do not hand-invalidate')
    expect(shared).not.toContain('--restart-verification')
  })

  it('gives verify and compliance explicit attempt ownership', () => {
    const verify = readTemplate('skills', 'specd-verify', 'SKILL.md.tpl')
    expect(verify).toContain('specd changes verification start <name> --format text')
    expect(verify).toContain('specd changes verification complete <name> --format text')
    expect(verify).toContain('/specd-compliance --change <name> --delegated --attempt <attemptId>')
    expect(verify).toContain('any active lifecycle')
    expect(verify).toContain('does **not** capture a baseline')
    expect(verify).toContain('There is no restart-verification flag')
    expect(verify).toContain('specd changes verification invalidate <name> --reason "<text>"')
    expect(verify).toContain('repeat all required verification work')
    expect(verify).toContain('Do not run `verification complete` after a failed scenario')
    expect(verify).not.toMatch(/--restart-verification/)

    const compliance = readTemplate('skills', 'specd-compliance', 'SKILL.md.tpl')
    expect(compliance).toContain('specd changes verification start <name> --format text')
    expect(compliance).toContain('specd changes verification complete <name> --format text')
    expect(compliance).toContain('`--change <name> --delegated --attempt <attemptId>`')
    expect(compliance).toContain('Do not run `verification start` or `verification complete`')
    expect(compliance).toContain('do not claim successful verification')
    expect(compliance).toContain('An existing active attempt does **not** make this')
    expect(compliance).toContain('`--all`, `--diff`, `--pr`')
    expect(compliance.indexOf('mode = delegated')).toBeLessThan(
      compliance.indexOf('`mode = change`, extract the change name'),
    )
  })

  it('routes delegated compliance through every change-scoped downstream decision', () => {
    const compliance = readTemplate('skills', 'specd-compliance', 'SKILL.md.tpl')
    const standalone = complianceDecision(compliance, '`change`')
    const delegated = complianceDecision(compliance, '`delegated`')

    expect(standalone.slice(0, 7)).toEqual([
      'change status',
      'project context',
      'change specs',
      'depth 1',
      'changes spec-preview',
      'change reports',
      'change',
    ])
    expect(delegated.slice(0, 7)).toEqual(standalone.slice(0, 7))
    expect(standalone.slice(7)).toEqual(['yes', 'yes'])
    expect(delegated.slice(7)).toEqual(['no', 'no'])

    const invalidDelegation = compliance.indexOf(
      'contains exactly one of `--delegated` or `--attempt`',
    )
    const standaloneFallback = compliance.indexOf('**Argument starts with `--change`**')
    expect(invalidDelegation).toBeGreaterThan(-1)
    expect(invalidDelegation).toBeLessThan(standaloneFallback)
  })

  it('routes design and implement recovery without forcing design for preserve', () => {
    for (const skill of ['specd-design', 'specd-implement'] as const) {
      const template = readTemplate('skills', skill, 'SKILL.md.tpl')
      expect(template).toContain('stale or revoked spec approval')
      expect(template).toContain('`designing`')
      expect(template).toContain('sign-off after `done`')
      expect(template).toContain('`done`')
      expect(template).toContain('Verification staleness does **not** move lifecycle state')
      expect(template).toContain('specd changes verification start <name>')
      expect(template).toContain('`workflow: preserve`')
      expect(template).toContain('`workflow: redesign`')
      expect(template).toContain('`artifacts: none` waives reopening, not freshness')
      expect(template).not.toContain('restart-verification flag on `changes transition`')
    }
  })

  it('keeps archive behind a live post-hook preflight', () => {
    const archive = readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')
    expect(archive).toContain('### 4b. Live preflight after hooks')
    expect(archive).toContain('Do not archive until that post-hook status passes')
    expect(archive).toContain(
      'Do not bypass tasks, artifacts, implementation, verification, or gates',
    )
    expect(archive).toContain('Do not hand-invalidate')
    expect(archive).toContain('specd changes verification start <name>')
    expect(archive).toContain('hasTasks')
    expect(archive.indexOf('### 4b. Live preflight after hooks')).toBeLessThan(
      archive.indexOf('### 5. Archive'),
    )
  })
})
