/**
 * Textual-content detection shared by indexing and path explanation.
 */

/**
 * Attempts to decode a buffer as supported textual content.
 * @param content - Raw file content.
 * @returns Decoded text when the content should be treated as a document.
 */
export function decodeTextualContent(content: Buffer): string | null {
  if (content.length === 0) {
    return ''
  }

  if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  }

  if (content[0] === 0xff && content[1] === 0xfe) {
    return new TextDecoder('utf-16le', { fatal: true }).decode(content)
  }

  if (content[0] === 0xfe && content[1] === 0xff) {
    return decodeUtf16Be(content)
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(content)
    if (!(content.includes(0) && decoded.includes('\u0000'))) {
      return decoded
    }
  } catch {
    // Fall through to the remaining encoding probes.
  }

  if (looksLikeUtf16Le(content)) {
    try {
      return new TextDecoder('utf-16le', { fatal: true }).decode(content)
    } catch {
      // Fall through to the remaining checks.
    }
  }

  if (looksLikeUtf16Be(content)) {
    try {
      return decodeUtf16Be(content)
    } catch {
      // Fall through to the remaining checks.
    }
  }

  if (!content.includes(0)) {
    try {
      return new TextDecoder('windows-1252', { fatal: true }).decode(content)
    } catch {
      return null
    }
  }

  return null
}

/**
 * Decodes a UTF-16BE buffer by swapping byte order before decoding.
 * @param content - Raw file content.
 * @returns Decoded text.
 */
function decodeUtf16Be(content: Buffer): string {
  const normalized =
    content.length % 2 === 0 ? Buffer.from(content) : Buffer.concat([content, Buffer.from([0])])
  normalized.swap16()
  return new TextDecoder('utf-16le', { fatal: true }).decode(normalized)
}

/**
 * Returns whether content matches the common UTF-16LE null-byte pattern.
 * @param content - Raw file content.
 * @returns True when odd bytes are predominantly NUL.
 */
function looksLikeUtf16Le(content: Buffer): boolean {
  return hasMostlyNullBytesAtParity(content, 1)
}

/**
 * Returns whether content matches the common UTF-16BE null-byte pattern.
 * @param content - Raw file content.
 * @returns True when even bytes are predominantly NUL.
 */
function looksLikeUtf16Be(content: Buffer): boolean {
  return hasMostlyNullBytesAtParity(content, 0)
}

/**
 * Checks whether one byte parity contains a dominant number of NUL bytes.
 * @param content - Raw file content.
 * @param parity - Byte parity to inspect.
 * @returns True when the sampled parity is mostly NUL.
 */
function hasMostlyNullBytesAtParity(content: Buffer, parity: 0 | 1): boolean {
  let samples = 0
  let nulls = 0
  for (let index = parity; index < content.length; index += 2) {
    samples++
    if (content[index] === 0) {
      nulls++
    }
  }

  return samples > 0 && nulls / samples >= 0.6
}
