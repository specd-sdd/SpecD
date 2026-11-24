/**
 * SHA-256 digest format with `sha256:` prefix.
 */
export type Sha256Digest = `sha256:${string}`

/** Algorithm identifier for artifact hash pre-processing. */
export type ArtifactFingerprintAlgorithm = 'artifact-pre-hash-v1'

/** Algorithm identifier for text content normalization. */
export type TextNormalizationAlgorithm = 'text-v1'

/** Algorithm identifier for binary content normalization. */
export type BinaryNormalizationAlgorithm = 'bytes-v1'

/**
 * Materialized fingerprint over schema-selected change artifacts.
 */
export interface ArtifactFingerprint {
  readonly version: 1
  readonly algorithm: ArtifactFingerprintAlgorithm
  readonly files: Readonly<Record<string, Sha256Digest>>
}

/**
 * Immutable evidence for spec approval.  The approved spec scope is part of
 * the evidence: identical artifacts do not authorize a newly added spec.
 */
export interface SpecApprovalFingerprint {
  readonly version: 1
  readonly specIds: readonly string[]
  readonly artifacts: ArtifactFingerprint
}

/**
 * Fingerprint record for a single implementation file.
 */
export interface ImplementationFingerprintEntry {
  readonly hash: Sha256Digest
  readonly content: 'text' | 'binary'
  readonly normalization: TextNormalizationAlgorithm | BinaryNormalizationAlgorithm
}

/**
 * Materialized fingerprint over confirmed implementation files.
 */
export interface ImplementationFingerprint {
  readonly version: 1
  readonly hashAlgorithm: 'sha256'
  readonly textNormalization: TextNormalizationAlgorithm
  readonly binaryNormalization: BinaryNormalizationAlgorithm
  readonly files: Readonly<Record<string, ImplementationFingerprintEntry>>
}

/**
 * Complete combined validity fingerprint covering artifacts and implementation.
 */
export interface ValidityFingerprint {
  readonly version: 1
  readonly artifacts: ArtifactFingerprint
  readonly implementation: ImplementationFingerprint
}

/**
 * Structured difference between two fingerprints.
 */
export interface FingerprintDifference {
  readonly scope: 'artifact' | 'implementation' | 'spec'
  readonly key: string
  readonly kind:
    | 'added'
    | 'removed'
    | 'changed'
    | 'algorithm-changed'
    | 'unreadable'
    | 'spec-added'
    | 'spec-removed'
  readonly expected?: string
  readonly actual?: string
}

/**
 * Canonicalizes an approval scope for durable comparison and serialization.
 *
 * @param specIds - Possibly duplicated or unordered spec identifiers
 * @returns Frozen, deduplicated identifiers in lexical order
 */
export function canonicalSpecIds(specIds: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(specIds)].sort((left, right) => left.localeCompare(right)))
}

/**
 * Compares scope-aware approval evidence without treating input order as meaningful.
 *
 * @param expected - Stored approval evidence
 * @param actual - Current canonical approval evidence
 * @returns Exact artifact and scope differences
 */
export function compareSpecApprovalFingerprints(
  expected: SpecApprovalFingerprint,
  actual: SpecApprovalFingerprint,
): FingerprintComparison {
  const differences = [
    ...compareArtifactFingerprints(expected.artifacts, actual.artifacts).differences,
  ]
  const expectedIds = new Set(canonicalSpecIds(expected.specIds))
  const actualIds = new Set(canonicalSpecIds(actual.specIds))

  for (const specId of [...actualIds].filter((id) => !expectedIds.has(id)).sort()) {
    differences.push({ scope: 'spec', key: specId, kind: 'spec-added', actual: specId })
  }
  for (const specId of [...expectedIds].filter((id) => !actualIds.has(id)).sort()) {
    differences.push({ scope: 'spec', key: specId, kind: 'spec-removed', expected: specId })
  }
  return { equal: differences.length === 0, differences: Object.freeze(differences) }
}

/**
 * Result of comparing two fingerprints.
 */
export interface FingerprintComparison {
  readonly equal: boolean
  readonly differences: readonly FingerprintDifference[]
}

/**
 * Normalizes text content under the `text-v1` algorithm.
 *
 * Algorithm steps:
 * 1. Remove one leading UTF-8 BOM (`\uFEFF`) if present.
 * 2. Replace CRLF (`\r\n`) and lone CR (`\r`) with LF (`\n`).
 * 3. Remove trailing spaces and tabs from every line (making whitespace-only lines empty).
 * 4. Remove all terminal LF characters and append exactly one LF (`\n`).
 *
 * @param content - Input text
 * @returns Normalized text ending in exactly one LF
 */
export function normalizeTextV1(content: string): string {
  let text = content
  // 1. Remove leading BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }

  // 2. Replace CRLF and CR with LF
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 3. Split by LF and strip trailing spaces and tabs from each line
  const lines = text.split('\n')
  const strippedLines = lines.map((line) => line.replace(/[ \t]+$/, ''))
  let result = strippedLines.join('\n')

  // 4. Remove all terminal LF characters and append exactly one LF
  result = result.replace(/\n+$/, '')
  return result + '\n'
}

/**
 * Classifies file byte contents deterministically as text or binary.
 *
 * Bytes are classified as text only when they contain no NUL byte (0x00)
 * and can be fully decoded by a fatal UTF-8 TextDecoder. All other inputs are binary.
 *
 * @param bytes - Raw file bytes
 * @returns `'text'` or `'binary'`
 */
export function classifyContent(bytes: Uint8Array): 'text' | 'binary' {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      return 'binary'
    }
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    decoder.decode(bytes)
    return 'text'
  } catch {
    return 'binary'
  }
}

/**
 * Normalizes a project-relative implementation file path to POSIX canonical form.
 *
 * Replaces backslashes with slashes, removes redundant dot segments, rejects empty paths,
 * absolute paths, and any path escaping the project root via `..`.
 *
 * @param path - File path to normalize
 * @returns Normalized POSIX path
 * @throws Error if path is absolute, empty, or traverses outside the project
 */
export function normalizeImplementationPath(path: string): string {
  if (!path || path.trim() === '') {
    throw new Error('Implementation path cannot be empty')
  }

  const forwardSlashes = path.replace(/\\/g, '/')
  if (forwardSlashes.startsWith('/')) {
    throw new Error(`Implementation path must be project-relative: ${path}`)
  }

  const segments = forwardSlashes.split('/')
  const resolved: string[] = []

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        throw new Error(`Implementation path cannot traverse outside project root: ${path}`)
      }
      resolved.pop()
    } else {
      resolved.push(segment)
    }
  }

  if (resolved.length === 0) {
    throw new Error(`Implementation path resolves to empty root: ${path}`)
  }

  return resolved.join('/')
}

/**
 * Compares two artifact fingerprints for equality.
 *
 * @param expected - The baseline artifact fingerprint
 * @param actual - The current artifact fingerprint
 * @returns Comparison result with structured differences
 */
export function compareArtifactFingerprints(
  expected: ArtifactFingerprint,
  actual: ArtifactFingerprint,
): FingerprintComparison {
  const differences: FingerprintDifference[] = []

  if (expected.version !== actual.version || expected.algorithm !== actual.algorithm) {
    differences.push({
      scope: 'artifact',
      key: '$algorithm',
      kind: 'algorithm-changed',
      expected: `${expected.algorithm}-v${expected.version}`,
      actual: `${actual.algorithm}-v${actual.version}`,
    })
  }

  const allKeys = new Set([...Object.keys(expected.files), ...Object.keys(actual.files)])
  const sortedKeys = Array.from(allKeys).sort()

  for (const key of sortedKeys) {
    const expHash = expected.files[key]
    const actHash = actual.files[key]

    if (expHash !== undefined && actHash === undefined) {
      differences.push({
        scope: 'artifact',
        key,
        kind: 'removed',
        expected: expHash,
      })
    } else if (expHash === undefined && actHash !== undefined) {
      differences.push({
        scope: 'artifact',
        key,
        kind: 'added',
        actual: actHash,
      })
    } else if (expHash !== undefined && actHash !== undefined && expHash !== actHash) {
      differences.push({
        scope: 'artifact',
        key,
        kind: 'changed',
        expected: expHash,
        actual: actHash,
      })
    }
  }

  return {
    equal: differences.length === 0,
    differences: Object.freeze(differences),
  }
}

/**
 * Compares two implementation fingerprints for equality.
 *
 * @param expected - The baseline implementation fingerprint
 * @param actual - The current implementation fingerprint
 * @returns Comparison result with structured differences
 */
export function compareImplementationFingerprints(
  expected: ImplementationFingerprint,
  actual: ImplementationFingerprint,
): FingerprintComparison {
  const differences: FingerprintDifference[] = []

  if (
    expected.version !== actual.version ||
    expected.hashAlgorithm !== actual.hashAlgorithm ||
    expected.textNormalization !== actual.textNormalization ||
    expected.binaryNormalization !== actual.binaryNormalization
  ) {
    differences.push({
      scope: 'implementation',
      key: '$algorithm',
      kind: 'algorithm-changed',
      expected: `${expected.hashAlgorithm}/${expected.textNormalization}/${expected.binaryNormalization}-v${expected.version}`,
      actual: `${actual.hashAlgorithm}/${actual.textNormalization}/${actual.binaryNormalization}-v${actual.version}`,
    })
  }

  const allKeys = new Set([...Object.keys(expected.files), ...Object.keys(actual.files)])
  const sortedKeys = Array.from(allKeys).sort()

  for (const key of sortedKeys) {
    const expEntry = expected.files[key]
    const actEntry = actual.files[key]

    if (expEntry !== undefined && actEntry === undefined) {
      differences.push({
        scope: 'implementation',
        key,
        kind: 'removed',
        expected: expEntry.hash,
      })
    } else if (expEntry === undefined && actEntry !== undefined) {
      differences.push({
        scope: 'implementation',
        key,
        kind: 'added',
        actual: actEntry.hash,
      })
    } else if (
      expEntry !== undefined &&
      actEntry !== undefined &&
      (expEntry.hash !== actEntry.hash ||
        expEntry.content !== actEntry.content ||
        expEntry.normalization !== actEntry.normalization)
    ) {
      differences.push({
        scope: 'implementation',
        key,
        kind: 'changed',
        expected: `${expEntry.content}:${expEntry.hash}`,
        actual: `${actEntry.content}:${actEntry.hash}`,
      })
    }
  }

  return {
    equal: differences.length === 0,
    differences: Object.freeze(differences),
  }
}

/**
 * Compares two combined validity fingerprints for equality.
 *
 * @param expected - The baseline validity fingerprint
 * @param actual - The current validity fingerprint
 * @returns Combined comparison result
 */
export function compareValidityFingerprints(
  expected: ValidityFingerprint,
  actual: ValidityFingerprint,
): FingerprintComparison {
  const artCmp = compareArtifactFingerprints(expected.artifacts, actual.artifacts)
  const implCmp = compareImplementationFingerprints(expected.implementation, actual.implementation)

  const differences = [...artCmp.differences, ...implCmp.differences]

  return {
    equal: differences.length === 0,
    differences: Object.freeze(differences),
  }
}
