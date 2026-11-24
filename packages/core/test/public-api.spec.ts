import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as corePublic from '../src/public.js'

describe('public barrel', () => {
  it('given the public surface, when inspected, then it does not export LifecycleEngine', () => {
    expect('LifecycleEngine' in corePublic).toBe(false)
    expect('LifecycleEngineOptions' in corePublic).toBe(false)
    expect('getLifecycleEngine' in corePublic).toBe(false)
  })

  it('given domain lifecycle modules, when inspected, then they do not import application logger', () => {
    const files = [
      '../src/domain/services/lifecycle-verdict.ts',
      '../src/domain/services/evaluate-transition-predicates.ts',
      '../src/domain/checks/workflow-requires.ts',
    ]
    for (const relative of files) {
      const src = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      expect(src).not.toMatch(/application\/logger/)
    }
  })
})
