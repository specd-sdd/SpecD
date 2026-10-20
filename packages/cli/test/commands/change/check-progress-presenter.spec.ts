import { describe, expect, it } from 'vitest'
import { type CheckProgressEvent } from '@specd/sdk'
import { createCheckProgressPresenter } from '../../../src/commands/change/_check-progress-presenter.js'

function collect(options: { skipChecks?: ReadonlySet<string>; skipHooks?: boolean } = {}) {
  const chunks: string[] = []
  const stream = { write: (text: string) => chunks.push(text) } as unknown as NodeJS.WriteStream
  const presenter = createCheckProgressPresenter({
    format: 'text',
    streamName: 'change-transition',
    stream,
    ...options,
  })
  const feed = (...events: CheckProgressEvent[]): void => {
    for (const event of events) presenter.onEvent(event)
  }
  return { feed, output: () => chunks.join('') }
}

const start = (id: string, label: string): CheckProgressEvent => ({
  type: 'check-start',
  id,
  label,
})
const done = (
  id: string,
  label: string,
  outcome: 'pass' | 'fail' | 'skip',
  reason?: string,
): CheckProgressEvent => ({
  type: 'check-done',
  id,
  label,
  outcome,
  ...(reason !== undefined ? { reason } : {}),
})

describe('check progress presenter', () => {
  it('renders hook skips caused by --skip-hooks as skipped', () => {
    const { feed, output } = collect({ skipHooks: true })
    feed(start('hook.pre', 'Running pre hooks'), done('hook.pre', 'Running pre hooks', 'skip'))
    expect(output()).toContain('⊘ Running pre hooks (skipped: --skip-hooks)')
    expect(output()).not.toContain('✓ Running pre hooks')
  })

  it('labels user-bypassed checks with --skip-checks', () => {
    const { feed, output } = collect({ skipChecks: new Set(['impl.linksInScope']) })
    feed(done('impl.linksInScope', 'Checking implementation links', 'skip'))
    expect(output()).toContain('⊘ Checking implementation links (skipped: --skip-checks)')
  })

  it('falls back to the check message or not applicable', () => {
    const { feed, output } = collect()
    feed(
      done('approval.spec', 'Checking spec approval', 'skip'),
      done('approval.signoff', 'Checking signoff', 'skip', 'signoff gate is off'),
    )
    expect(output()).toContain('⊘ Checking spec approval (skipped: not applicable)')
    expect(output()).toContain('⊘ Checking signoff (skipped: signoff gate is off)')
  })

  it('hides the repeated re-check when no hook ran', () => {
    const { feed, output } = collect({ skipHooks: true })
    feed(
      start('workflow.requires', 'Checking required artifacts'),
      done('workflow.requires', 'Checking required artifacts', 'pass'),
      start('hook.post', 'Running post hooks'),
      done('hook.post', 'Running post hooks', 'skip'),
      start('workflow.requires', 'Checking required artifacts'),
      done('workflow.requires', 'Checking required artifacts', 'pass'),
    )
    expect(output().match(/Checking required artifacts/g)).toHaveLength(2)
    expect(output()).not.toContain('Re-checking after hooks')
  })

  it('labels the re-check once when a hook ran', () => {
    const { feed, output } = collect()
    feed(
      start('workflow.requires', 'Checking required artifacts'),
      done('workflow.requires', 'Checking required artifacts', 'pass'),
      start('protocol.edge', 'Validating transition edge'),
      done('protocol.edge', 'Validating transition edge', 'pass'),
      start('hook.post', 'Running post hooks'),
      done('hook.post', 'Running post hooks', 'pass'),
      start('protocol.edge', 'Validating transition edge'),
      done('protocol.edge', 'Validating transition edge', 'pass'),
      start('workflow.requires', 'Checking required artifacts'),
      done('workflow.requires', 'Checking required artifacts', 'pass'),
    )
    expect(output().match(/Re-checking after hooks/g)).toHaveLength(1)
    expect(output().match(/Checking required artifacts \(workflow.requires\)/g)).toHaveLength(2)
  })

  it('leaves structured streams unchanged', () => {
    const chunks: string[] = []
    const presenter = createCheckProgressPresenter({
      format: 'json',
      streamName: 'change-transition',
      stream: { write: (text: string) => chunks.push(text) } as unknown as NodeJS.WriteStream,
    })
    presenter.onEvent(start('a', 'A'))
    presenter.onEvent(done('a', 'A', 'skip'))
    presenter.onEvent(start('a', 'A'))
    expect(chunks).toHaveLength(3)
  })
})
