import { describe, it, expect } from 'vitest'
import { SpecdError } from '../../../src/domain/errors/specd-error.js'

class TestError extends SpecdError {
  get code() {
    return 'TEST_ERROR'
  }
}

describe('SpecdError', () => {
  it('has specd discriminator set to true', () => {
    const error = new TestError('Test message')
    expect(error.specd).toBe(true)
  })

  it('preserves error message and name', () => {
    const error = new TestError('Test message')
    expect(error.message).toBe('Test message')
    expect(error.name).toBe('TestError')
  })

  it('has the expected error code', () => {
    const error = new TestError('Test message')
    expect(error.code).toBe('TEST_ERROR')
  })
})
