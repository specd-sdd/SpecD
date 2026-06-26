import { describe, expect, it } from 'vitest'
import type { CompileContextInput } from '../../../src/application/use-cases/compile-context.js'
import type { GetProjectContextInput } from '../../../src/application/use-cases/get-project-context.js'

/** Compile-time guard: fails if `config` is added to the input type. */
type AssertNoConfigKey<T> = 'config' extends keyof T ? never : void

type _CompileContextInputBoundary = AssertNoConfigKey<CompileContextInput>
type _GetProjectContextInputBoundary = AssertNoConfigKey<GetProjectContextInput>

const _compileContextBoundary: _CompileContextInputBoundary = undefined
const _projectContextBoundary: _GetProjectContextInputBoundary = undefined

void _compileContextBoundary
void _projectContextBoundary

describe('kernel use case execute input boundary', () => {
  it('CompileContextInput has no config property at runtime', () => {
    const input: CompileContextInput = { name: 'audit-change', step: 'designing' }
    expect(input).not.toHaveProperty('config')
  })

  it('GetProjectContextInput has no config property at runtime', () => {
    const input: GetProjectContextInput = {}
    expect(input).not.toHaveProperty('config')
  })
})
