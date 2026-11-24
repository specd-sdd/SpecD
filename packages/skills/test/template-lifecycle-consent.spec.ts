import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const templatesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

function readTemplate(...parts: string[]): string {
  return readFileSync(join(templatesRoot, ...parts), 'utf8')
}

function routingRow(content: string, target: string): string {
  const row = content.split('\n').find((line) => line.startsWith(`| \`${target}\``))
  if (!row) throw new Error(`Missing routing row for ${target}`)
  return row
}

const archive = (): string => readTemplate('skills', 'specd-archive', 'SKILL.md.tpl')

describe('shared Next Action engine contract', () => {
  const shared = readTemplate('shared', 'shared.md.tpl')
  const section = shared.slice(shared.indexOf('## Next Action engine'))

  it('lists every nextAction field', () => {
    for (const name of [
      'targetStep',
      'actionType',
      'reason',
      'intent',
      'action',
      'command',
      'guidance',
    ]) {
      expect(section, name).toContain(`\`${name}\``)
    }
    expect(section).toContain('design')
    expect(section).toContain('archive')
    expect(section).toContain('{kind, params?, guidance?}')
  })

  it('requires following guidance when command is null', () => {
    expect(section).toContain('command: null')
    expect(section).toMatch(/MUST follow `guidance`/)
  })
})

describe('lifecycle consent template contracts', () => {
  describe('specd-new routing rows', () => {
    const content = readTemplate('skills', 'specd-new', 'SKILL.md.tpl')

    it('treats pending-spec-approval as drain-only and follows nextAction once consent exists', () => {
      const row = routingRow(content, 'pending-spec-approval')
      expect(row).toContain('Drain only')
      expect(row).toContain('specd changes approve spec <name>')
      expect(row).toContain('while consent is missing')
      expect(row).toContain('otherwise follow `nextAction`')
      expect(row).not.toMatch(/\/specd-(design|implement|verify|archive)/)
    })

    it('treats pending-signoff as drain-only and follows nextAction once consent exists', () => {
      const row = routingRow(content, 'pending-signoff')
      expect(row).toContain('Drain only')
      expect(row).toContain('specd changes approve signoff <name>')
      expect(row).toContain('while consent is missing')
      expect(row).toContain('otherwise follow `nextAction`')
      expect(row).not.toMatch(/\/specd-(design|implement|verify|archive)/)
    })

    it('suggests approve commands for ready/done with an unsatisfied gate', () => {
      expect(routingRow(content, 'ready')).toContain('human `approve spec`')
      expect(routingRow(content, 'done` / `signed-off')).toContain('human `approve signoff`')
    })

    it('does not present pending states as transition targets', () => {
      expect(content).not.toMatch(/transition\s+pending-(spec-approval|signoff)/)
    })
  })

  describe('specd-implement consent branches', () => {
    const content = readTemplate('skills', 'specd-implement', 'SKILL.md.tpl')

    it('stays in place and never transitions when spec consent is missing', () => {
      expect(content).toContain(
        'If in `ready`, `pending-spec-approval`, or `spec-approved` and the spec gate is on with no recorded spec approval',
      )
      expect(content).toContain('`APPROVAL_REQUIRED` blocker')
      expect(content).toContain('**stay in place**')
      expect(content).toContain('specd changes approve spec <name> --reason "..."')
      expect(content).toContain('Do **not** `transition implementing`.')
    })

    it('transitions to implementing when the spec gate is off or consent is recorded', () => {
      expect(content).toContain(
        'If in `ready`, `pending-spec-approval`, or `spec-approved` with spec gate off (or spec already approved), run pre-hooks and transition',
      )
      expect(content).toMatch(/specd changes transition <name> <target>/)
    })

    it('orders the missing-consent stop before the transition branch', () => {
      const missing = content.indexOf('**stay in place**')
      const recorded = content.indexOf('with spec gate off (or spec already approved)')
      expect(missing).toBeGreaterThan(-1)
      expect(recorded).toBeGreaterThan(missing)
    })

    it('never tells the agent to approve', () => {
      expect(content).not.toMatch(/run `specd changes approve[^`]*` yourself/)
    })
  })

  describe('shared.md delta text', () => {
    const content = readTemplate('shared', 'shared.md.tpl')

    it('forbids agents from approving and keeps the change in ready/done', () => {
      expect(content).toContain('**You MUST NEVER run `changes approve` yourself.**')
      expect(content).toContain('the change **stays** in `ready` or `done`')
      expect(content).toContain('specd changes approve spec <name> --reason "..."')
      expect(content).toContain('specd changes approve signoff <name> --reason "..."')
    })

    it('mentions pending states only as drain', () => {
      expect(content).toContain('MAY appear only as **drain**')
      expect(content).toContain('not as the happy-path wait')
      expect(content).toContain(
        'Approving in a\ndrain state records consent without moving the change.',
      )
    })

    it('does not list pending states as happy-path hook intermediates', () => {
      expect(content).toContain(
        'Do **not**\nlist `pending-spec-approval` / `pending-signoff` as happy-path intermediates',
      )
      expect(content).toContain('MUST NOT run `source.post` on `along` backward')
    })

    it('has no happy-path parking copy', () => {
      expect(content).not.toMatch(/routes to `pending-(signoff|spec-approval)`/)
      expect(content).not.toMatch(/reaches `pending-(signoff|spec-approval)`/)
      expect(content).not.toMatch(/transition[^.\n]*`?pending-(signoff|spec-approval)`?/)
    })
  })

  describe('specd-archive overlap handling', () => {
    it('scopes OVERLAP_CONFLICT to live overlap and bypasses it only via status-shown flag', () => {
      const content = archive()
      expect(content).toContain('`OVERLAP_CONFLICT` means live overlap with other active')
      expect(content).toContain('with the flag status shows under the blocker')
      expect(content).toContain('A blocker whose status shows no `bypass:` flag')
    })

    it('routes invalidation overlap to design and never bypasses it', () => {
      const content = archive()
      expect(content).toContain(
        'If `review.reason` is `spec-overlap-conflict`, run\n`/specd-design`',
      )
      expect(content).toContain('never bypass it')
    })

    it('does not mention transitioning into pending-signoff', () => {
      expect(archive()).not.toMatch(/transition[^.\n]*pending-signoff/)
    })
  })
})
