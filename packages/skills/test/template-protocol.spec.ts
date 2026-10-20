import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(packageRoot, '..', '..')

const LIFECYCLE_SKILLS = ['specd-design', 'specd-implement', 'specd-verify', 'specd-archive']
const INSTALLED_COPIES = [
  '.claude/skills',
  '.agents/skills',
  '.codex/skills',
  '.github/skills',
  '.opencode/skills',
] as const

const STATES =
  'drafting|designing|ready|pending-spec-approval|spec-approved|implementing|verifying|done|pending-signoff|signed-off|archivable|archiving'
const LITERAL_TRANSITION = new RegExp(`changes transition <name> (?:${STATES})\\b`)
const LITERAL_HOOK = new RegExp(`(?:run-hooks|hook-instruction) <name> (?:${STATES})\\b`)
// Backward redirects (`/specd-design`) are legitimate; forward completion text is not.
const FIXED_COMPLETION =
  /run `\/specd-(?:implement|verify|archive)|(?:continue with|next:)\s+`\/specd-/i
// Prose naming a fixed delivery chain overrides routed advancement. Outside routed blocks only.
const FIXED_CHAIN =
  /`?(?:implementing|verifying|done)`?\s*→\s*`?(?:verifying|done|archivable)`?\s*→/i
const TEXT_APPROVALS_READ =
  /\*\*approvals:\*\*|\bapprovals\.(?:spec|signoff)\s*=\s*(?:on|off)\b|`approvals:` (?:line|field)/i
const ROUTE_OPEN = /^\s*<!-- route: target -->\s*$/
const ROUTE_CLOSE = /^\s*<!-- \/route -->\s*$/

/** A protocol violation outside a routed block. */
interface Violation {
  readonly line: number
  readonly rule:
    | 'literal-transition'
    | 'literal-hook'
    | 'fixed-completion'
    | 'routed-literal-target'
    | 'text-approvals-read'
    | 'fixed-chain'
  readonly text: string
}

/**
 * Parses a lifecycle skill line by line and reports literal-state recipes and
 * fixed next-skill completion text that appear outside `<!-- route: target -->` blocks.
 *
 * @param content - Template or installed skill content
 * @returns Violations with 1-based line numbers
 */
function findViolations(content: string): Violation[] {
  const violations: Violation[] = []
  let routed = false
  content.split('\n').forEach((text, index) => {
    if (ROUTE_OPEN.test(text)) {
      routed = true
      return
    }
    if (ROUTE_CLOSE.test(text)) {
      routed = false
      return
    }
    const line = index + 1
    if (TEXT_APPROVALS_READ.test(text)) violations.push({ line, rule: 'text-approvals-read', text })
    if (routed) {
      // Routed blocks may only name the <target> / <source> placeholders.
      if (LITERAL_TRANSITION.test(text) || LITERAL_HOOK.test(text)) {
        violations.push({ line, rule: 'routed-literal-target', text })
      }
      return
    }
    if (LITERAL_TRANSITION.test(text)) violations.push({ line, rule: 'literal-transition', text })
    if (LITERAL_HOOK.test(text)) violations.push({ line, rule: 'literal-hook', text })
    if (FIXED_COMPLETION.test(text)) violations.push({ line, rule: 'fixed-completion', text })
    if (FIXED_CHAIN.test(text)) violations.push({ line, rule: 'fixed-chain', text })
  })
  return violations
}

function describeViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.line}: [${v.rule}] ${v.text.trim()}`).join('\n')
}

describe('lifecycle skill template protocol validator', () => {
  it('detects literal-state recipes and fixed completion text outside routed blocks', () => {
    const content = [
      'specd changes transition <name> implementing --skip-hooks all',
      'specd changes run-hooks <name> verifying --phase pre',
      'specd changes hook-instruction <name> done --phase post --format text',
      'Implementation complete. Run `/specd-verify <name>` next.',
    ].join('\n')

    expect(findViolations(content).map((v) => v.rule)).toEqual([
      'literal-transition',
      'literal-hook',
      'literal-hook',
      'fixed-completion',
    ])
  })

  it('accepts placeholder recipes inside and outside routed blocks', () => {
    const content = [
      'specd changes transition <name> <target> --skip-hooks all',
      '<!-- route: target -->',
      'specd changes run-hooks <name> <source> --phase post',
      'specd changes transition <name> <target> --skip-hooks all',
      'Next: the command in `nextAction.command`.',
      '<!-- /route -->',
    ].join('\n')

    expect(findViolations(content)).toEqual([])
  })

  it('rejects a literal lifecycle target inside a routed block', () => {
    const content = [
      '<!-- route: target -->',
      'specd changes transition <name> implementing --skip-hooks all',
      'specd changes run-hooks <name> verifying --phase pre',
      '<!-- /route -->',
    ].join('\n')

    expect(findViolations(content).map((v) => v.rule)).toEqual([
      'routed-literal-target',
      'routed-literal-target',
    ])
  })

  it('detects broader fixed completion text outside routed blocks', () => {
    const content = [
      'Continue with `/specd-verify <name>`.',
      'Next: `/specd-archive`',
      '<!-- route: target -->',
      'Run `/specd-verify` only when routed',
      '<!-- /route -->',
    ].join('\n')

    expect(findViolations(content).map((v) => v.rule)).toEqual([
      'fixed-completion',
      'fixed-completion',
    ])
  })

  it('detects a fixed delivery chain in prose', () => {
    expect(
      findViolations(
        'Advancement (`implementing` → `verifying` → `done` → `archivable`) is separate',
      ).map((v) => v.rule),
    ).toEqual(['fixed-chain'])
    expect(findViolations('ready → implementing is a hop')).toEqual([])
  })

  it('detects approvals read from text status', () => {
    expect(
      findViolations('check the **state:** and **approvals:** fields.').map((v) => v.rule),
    ).toEqual(['text-approvals-read'])
    expect(findViolations('status `approvals.spec=on` and a blocker').map((v) => v.rule)).toEqual([
      'text-approvals-read',
    ])
    expect(findViolations('use the toon `lifecycle.approvals` block')).toEqual([])
  })

  for (const skill of LIFECYCLE_SKILLS) {
    it(`${skill} template has no literal-state recipes outside routed blocks`, () => {
      const content = readFileSync(
        join(packageRoot, 'templates', 'skills', skill, 'SKILL.md.tpl'),
        'utf8',
      )
      expect(describeViolations(findViolations(content))).toBe('')
    })

    for (const copyRoot of INSTALLED_COPIES) {
      const installed = join(repoRoot, copyRoot, skill, 'SKILL.md')
      it(`${copyRoot}/${skill} has no literal-state recipes outside routed blocks`, () => {
        // Installed copies are generated: a missing copy means the sync was not run.
        expect(existsSync(installed), `missing installed copy ${copyRoot}/${skill}`).toBe(true)
        expect(describeViolations(findViolations(readFileSync(installed, 'utf8')))).toBe('')
      })
    }
  }

  it('shared notes template names no fixed delivery-state hook list', () => {
    const shared = readFileSync(join(packageRoot, 'templates', 'shared', 'shared.md.tpl'), 'utf8')
    expect(shared).not.toMatch(
      /`designing`, `ready`, `implementing`, `verifying`, `done`, `archivable`/,
    )
  })
})
