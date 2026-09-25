import { describe, expect, it } from 'vitest'
import { sha256 } from '../../../src/infrastructure/fs/hash.js'
import { NodeContentHasher } from '../../../src/infrastructure/node/content-hasher.js'
import { computeArtifactHash } from '../../../src/application/use-cases/_shared/compute-artifact-hash.js'

const LF = 'alpha\nbeta\n'
const LF_DIGEST = 'sha256:e49c81e2d2f84e259d40e2fb8192f3bcd198b355184845d76d8f58807d0d78ee'

describe('text hash newline normalization', () => {
  it('hashes CRLF and lone CR the same as LF', () => {
    expect(sha256('alpha\r\nbeta\r')).toBe(sha256(LF))
    expect(new NodeContentHasher().hash('alpha\r\nbeta\r')).toBe(LF_DIGEST)
    expect(computeArtifactHash('alpha\r\nbeta\r', sha256)).toBe(computeArtifactHash(LF, sha256))
  })

  it('keeps the previous digest for LF-only text', () => {
    expect(sha256(LF)).toBe(LF_DIGEST)
  })
})
