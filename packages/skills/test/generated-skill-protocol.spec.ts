import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(packageRoot, '..', '..')

function readRepo(...parts: string[]): string {
  return readFileSync(join(repoRoot, ...parts), 'utf8')
}

function decisionTable(content: string): string[] {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => line.startsWith('| mode | status |'))
  if (start < 0) throw new Error('Missing compliance downstream decision table')
  return lines.slice(start, start + 5)
}

const copies = [
  '.agents/skills',
  '.codex/skills',
  '.claude/skills',
  '.github/skills',
  '.opencode/skills',
] as const

describe('generated skill protocol parity', () => {
  it('keeps installed verify, compliance, and lifecycle skills aligned with source phrases', () => {
    const expectations: Record<string, readonly string[]> = {
      'specd-verify': [
        'specd changes verification start <name>',
        'specd changes verification complete <name>',
        '--delegated --attempt <attemptId>',
        'verification invalidate',
        'no restart-verification flag',
      ],
      'specd-compliance': [
        'specd changes verification start <name>',
        'specd changes verification complete <name>',
        '--delegated --attempt <attemptId>',
        'do not claim successful verification',
        'mode = delegated',
      ],
      'specd-design': [
        'stale or revoked spec approval',
        'Verification staleness does **not** move lifecycle state',
        '`artifacts: none` waives reopening, not freshness',
      ],
      'specd-implement': [
        'stale or revoked spec approval',
        'Verification staleness does **not** move lifecycle state',
        '`workflow: preserve`',
      ],
      'specd-archive': [
        'Do not archive until that post-hook status passes',
        'Do not hand-invalidate',
        'Do not bypass tasks, artifacts, implementation, verification, or gates',
      ],
    }

    for (const [skill, phrases] of Object.entries(expectations)) {
      const source = readFileSync(
        join(packageRoot, 'templates', 'skills', skill, 'SKILL.md.tpl'),
        'utf8',
      )
      for (const phrase of phrases) {
        expect(source, `${skill} template`).toContain(phrase)
        for (const copyRoot of copies) {
          const generated = readRepo(copyRoot, skill, 'SKILL.md')
          expect(generated, `${copyRoot}/${skill}`).toContain(phrase)
        }
      }
    }

    const sharedSource = readFileSync(
      join(packageRoot, 'templates', 'shared', 'shared.md.tpl'),
      'utf8',
    )
    const sharedInstalled = readRepo('.specd', 'config', 'skills', 'shared', 'shared.md')
    for (const phrase of [
      'Do not calculate fingerprints',
      'Verification staleness alone never moves lifecycle state',
      'specd changes verification invalidate <name>',
    ]) {
      expect(sharedSource).toContain(phrase)
      expect(sharedInstalled).toContain(phrase)
    }
  })

  it('keeps the complete delegated downstream decision matrix identical in every installed copy', () => {
    const source = readFileSync(
      join(packageRoot, 'templates', 'skills', 'specd-compliance', 'SKILL.md.tpl'),
      'utf8',
    )
    const expected = decisionTable(source)

    for (const copyRoot of copies) {
      const generated = readRepo(copyRoot, 'specd-compliance', 'SKILL.md')
      expect(decisionTable(generated), `${copyRoot}/specd-compliance`).toEqual(expected)
    }
  })
})
