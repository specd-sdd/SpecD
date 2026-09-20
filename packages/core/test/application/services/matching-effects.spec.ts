import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_BINDINGS,
  TRANSITION_BINDINGS,
} from '../../../src/domain/services/check-bindings.js'
import { classifyAlong } from '../../../src/domain/services/transition-checks.js'
import {
  hookFailureMode,
  matchingEffects,
} from '../../../src/application/services/execute-hook-effect.js'

const SCHEMA_STD_STEPS = [
  'drafting',
  'designing',
  'ready',
  'implementing',
  'verifying',
  'done',
  'archivable',
  'archiving',
]

describe('matchingEffects', () => {
  it('given transition before-persist, when selecting effects, then returns post then pre without hardcoding ids for the slot', () => {
    const along = classifyAlong('implementing', 'verifying', SCHEMA_STD_STEPS)
    const rows = matchingEffects(
      TRANSITION_BINDINGS,
      { scope: 'transition', from: 'implementing', to: 'verifying', along },
      'before-persist',
      along,
    )
    expect(rows.map((row) => row.check.id)).toEqual(['hook.post', 'hook.pre'])
    expect(rows.every((row) => row.phase === 'before-persist')).toBe(true)
  })

  it('given redesign, when selecting before-persist, then omits hook.post by along filter', () => {
    const along = classifyAlong('implementing', 'designing', SCHEMA_STD_STEPS)
    const rows = matchingEffects(
      TRANSITION_BINDINGS,
      { scope: 'transition', from: 'implementing', to: 'designing', along },
      'before-persist',
      along,
    )
    expect(rows.map((row) => row.check.id)).toEqual(['hook.pre'])
  })

  it('given backward, when selecting before-persist, then omits hook.post', () => {
    const along = classifyAlong('verifying', 'implementing', SCHEMA_STD_STEPS)
    const rows = matchingEffects(
      TRANSITION_BINDINGS,
      { scope: 'transition', from: 'verifying', to: 'implementing', along },
      'before-persist',
      along,
    )
    expect(along).toBe('backward')
    expect(rows.map((row) => row.check.id)).toEqual(['hook.pre'])
  })

  it('given recovery, when selecting before-persist, then omits hook.pre and hook.post', () => {
    const along = classifyAlong('archiving', 'archivable', SCHEMA_STD_STEPS)
    const rows = matchingEffects(
      TRANSITION_BINDINGS,
      { scope: 'transition', from: 'archiving', to: 'archivable', along },
      'before-persist',
      along,
    )
    expect(along).toBe('recovery')
    expect(rows.map((row) => row.check.id)).toEqual([])
  })

  it('given archive after-persist, when selecting effects, then returns collect policy without filtering by check id', () => {
    const rows = matchingEffects(ARCHIVE_BINDINGS, { scope: 'archive' }, 'after-persist')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.phase).toBe('after-persist')
    expect(rows[0]?.onFailure).toBe('collect')
    expect(hookFailureMode(rows[0]?.onFailure)).toBe('fail-soft')
  })

  it('given archive before-persist, when selecting effects, then returns abort policy', () => {
    const rows = matchingEffects(ARCHIVE_BINDINGS, { scope: 'archive' }, 'before-persist')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.onFailure).toBe('abort')
    expect(hookFailureMode(rows[0]?.onFailure)).toBe('fail-fast')
  })
})
