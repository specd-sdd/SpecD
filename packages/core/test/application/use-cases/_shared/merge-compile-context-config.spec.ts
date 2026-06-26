import { describe, it, expect } from 'vitest'
import { mergeCompileContextRuntimeOverrides } from '../../../../src/application/use-cases/_shared/merge-compile-context-config.js'
import { type CompileContextConfig } from '../../../../src/application/use-cases/compile-context.js'

const defaults: CompileContextConfig = {
  contextMode: 'summary',
  llmOptimizedContext: false,
  contextIncludeSpecs: ['default:*'],
}

describe('mergeCompileContextRuntimeOverrides', () => {
  it('returns baked defaults when no overrides are provided', () => {
    expect(mergeCompileContextRuntimeOverrides(defaults, {})).toEqual(defaults)
  })

  it('applies runtime overrides over baked defaults', () => {
    expect(
      mergeCompileContextRuntimeOverrides(defaults, {
        contextMode: 'full',
        llmOptimizedContext: true,
      }),
    ).toEqual({
      contextMode: 'full',
      llmOptimizedContext: true,
      contextIncludeSpecs: ['default:*'],
    })
  })
})
