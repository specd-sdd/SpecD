import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Change } from '../../../src/domain/entities/change.js'
import { type ChangeState } from '../../../src/domain/value-objects/change-state.js'
import {
  approveSignoffAction,
  approveSpecAction,
  fail,
  pass,
  startVerificationAction,
} from '../../../src/domain/services/transition-checks.js'
import { evaluateLifecycle } from '../../../src/application/services/lifecycle-evaluation.js'
import { makeSchema, makeWorkflowStep, testActor } from '../use-cases/helpers.js'

/** Delivery syntax that `@specd/core` projections must never carry. */
const DELIVERY_SYNTAX = /specd |--[a-z]|\/specd-[a-z]/

const schema = makeSchema(
  [],
  [
    makeWorkflowStep('designing'),
    makeWorkflowStep('ready'),
    makeWorkflowStep('implementing'),
    makeWorkflowStep('verifying'),
    makeWorkflowStep('done'),
    makeWorkflowStep('archivable'),
  ],
)

function changeIn(state: ChangeState): Change {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const change = new Change({
    name: 'checkout-retry',
    createdAt: at,
    specIds: ['core:change'],
    schemaName: 'test-schema',
    schemaVersion: 1,
    history: [
      {
        type: 'created',
        at,
        by: testActor,
        specIds: ['core:change'],
        schemaName: 'test-schema',
        schemaVersion: 1,
      },
    ],
  })
  for (const step of [
    'designing',
    'ready',
    'implementing',
    'verifying',
    'done',
    'archivable',
  ] as const) {
    if (change.state === state) break
    change.transition(step, testActor)
  }
  return change
}

describe('host-neutral core projections', () => {
  it('serialized nextAction and blockers never contain CLI or slash-command syntax', () => {
    const failing = [
      pass('protocol.edge'),
      fail(
        'approval.spec',
        'APPROVAL_REQUIRED',
        'Spec approval is required',
        { gate: 'spec' },
        undefined,
        undefined,
        approveSpecAction(),
      ),
      fail(
        'approval.signoff',
        'APPROVAL_REQUIRED',
        'Signoff is required',
        { gate: 'signoff' },
        undefined,
        undefined,
        approveSignoffAction(),
      ),
      fail(
        'verification.current',
        'VERIFICATION_STALE',
        'Verification evidence is stale',
        undefined,
        undefined,
        undefined,
        startVerificationAction('checkout-retry'),
      ),
    ]
    const states: ChangeState[] = [
      'designing',
      'ready',
      'implementing',
      'verifying',
      'done',
      'archivable',
    ]
    for (const state of states) {
      const verdict = evaluateLifecycle(changeIn(state), schema, {
        approvals: { spec: true, signoff: true },
        checksByTarget: {
          designing: failing,
          ready: failing,
          implementing: failing,
          verifying: failing,
          done: failing,
          archivable: failing,
        },
      })
      const serialized = JSON.stringify({
        nextAction: verdict.nextAction,
        nextHop: verdict.nextHop,
        blockers: verdict.blockers,
        checks: verdict.checks,
      })
      expect(serialized, state).not.toMatch(DELIVERY_SYNTAX)
      expect('command' in verdict.nextAction, state).toBe(false)
    }
  })

  it('has no delivery syntax in executable string literals of domain and application code', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const roots = [join(here, '../../../src/domain'), join(here, '../../../src/application')]
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        if (!path.endsWith('.ts')) continue
        const lines = readFileSync(path, 'utf8').split('\n')
        lines.forEach((line, index) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))
            return
          if (/^\s*import |from '/.test(line)) return
          if (
            /['"`][^'"`]*(\/specd-[a-z]|--skip-checks|--skip-hooks|--allow-|--force|--next\b|--target\b|--(?:set|add|remove|clear)\b|specd changes? |specd specs? |[Pp]ass (?:force|skipChecks|allowOutOfScope)|without force|run "specs init")/.test(
              line,
            )
          ) {
            offenders.push(`${path}:${String(index + 1)}: ${trimmed}`)
          }
        })
      }
    }
    roots.forEach(walk)
    expect(offenders).toEqual([])
  })
})
