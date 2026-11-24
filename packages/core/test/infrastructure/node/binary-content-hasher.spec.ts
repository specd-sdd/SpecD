import { describe, expect, it } from 'vitest'
import { NodeBinaryContentHasher } from '../../../src/infrastructure/node/binary-content-hasher.js'

describe('NodeBinaryContentHasher', () => {
  it('returns a sha256 digest of the raw bytes', () => {
    const hasher = new NodeBinaryContentHasher()
    expect(hasher.hash(new Uint8Array([0, 1, 2]))).toBe(
      'sha256:ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc',
    )
  })
})
