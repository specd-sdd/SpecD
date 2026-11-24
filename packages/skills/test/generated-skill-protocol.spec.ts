import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSkillRepository } from '../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
 * Installed agent copies (.claude/skills, .agents/skills, ...) are gitignored
 * build output, so tests must not read them. The rendered bundle is what every
 * plugin writes into those copies, so it is the hermetic equivalent.
 */
const repository = createSkillRepository()

async function renderedFile(skill: string, filename: string): Promise<string> {
  const bundle = await repository.getBundle(skill)
  const file = bundle.files.find((candidate) => candidate.filename === filename)
  if (!file) throw new Error(`Rendered bundle ${skill} has no ${filename}`)
  return file.content
}

function decisionTable(content: string): string[] {
  const lines = content.split('\n')
  const start = lines.findIndex((line) => line.startsWith('| mode | status |'))
  if (start < 0) throw new Error('Missing compliance downstream decision table')
  return lines.slice(start, start + 5)
}

describe('generated skill protocol parity', () => {
  it('keeps rendered verify, compliance, and lifecycle skills aligned with source phrases', async () => {
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
        expect(await renderedFile(skill, 'SKILL.md'), `${skill} rendered`).toContain(phrase)
      }
    }

    const sharedSource = readFileSync(
      join(packageRoot, 'templates', 'shared', 'shared.md.tpl'),
      'utf8',
    )
    const sharedInstalled = await renderedFile('specd-verify', 'shared.md')
    for (const phrase of [
      'Do not calculate fingerprints',
      'Verification staleness alone never moves lifecycle state',
      'specd changes verification invalidate <name>',
    ]) {
      expect(sharedSource).toContain(phrase)
      expect(sharedInstalled).toContain(phrase)
    }
  })

  it('keeps the complete delegated downstream decision matrix identical in the rendered skill', async () => {
    const source = readFileSync(
      join(packageRoot, 'templates', 'skills', 'specd-compliance', 'SKILL.md.tpl'),
      'utf8',
    )
    const expected = decisionTable(source)

    const generated = await renderedFile('specd-compliance', 'SKILL.md')
    expect(decisionTable(generated), 'rendered specd-compliance').toEqual(expected)
  })

  it('keeps schema-aware routing and bypassed-hook suppression in every rendered lifecycle skill', async () => {
    for (const skill of ['specd-design', 'specd-implement', 'specd-verify', 'specd-archive']) {
      const source = readFileSync(
        join(packageRoot, 'templates', 'skills', skill, 'SKILL.md.tpl'),
        'utf8',
      )
      for (const phrase of ['nextAction.command', 'lifecycle.availableTransitions', 'bypassed']) {
        expect(source, `${skill} template`).toContain(phrase)
        expect(await renderedFile(skill, 'SKILL.md'), `${skill} rendered`).toContain(phrase)
      }
    }
  })

  describe('semantic routing invariants for generated lifecycle skills', () => {
    it('all rendered skills mandate preferred default recommendation and explicit target validation', async () => {
      for (const skill of [
        'specd-design',
        'specd-implement',
        'specd-verify',
        'specd-archive',
      ] as const) {
        const generated = await renderedFile(skill, 'SKILL.md')
        expect(generated, skill).toContain('preferred default recommendation')
        expect(generated, skill).toContain('lifecycle.availableTransitions')
        expect(generated, skill).toMatch(/When explicitly\s+invoked/)
        expect(generated, skill).toContain('stop before running any hooks')
      }
    })
  })
})
