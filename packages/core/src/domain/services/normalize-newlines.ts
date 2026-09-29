/**
 * Rewrites CRLF and lone CR line endings to LF.
 *
 * @param text - Text whose newline spelling should not affect a digest
 * @returns The same text with `\n` line endings
 */
export function normalizeNewlines(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}
