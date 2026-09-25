/**
 * Rewrites quote syntax in a developer hook command for the host shell.
 *
 * Values are already substituted. This function does not add quotes around
 * them and does not rewrite `%`.
 *
 * @param command - Hook command after verbatim template substitution
 * @param host - Shell that will execute `command`
 * @returns The command with quote syntax the host understands
 */
export function translateHookCommand(command: string, host: 'posix' | 'cmd'): string {
  return host === 'cmd' ? toCmdQuotes(command) : toPosixQuotes(command)
}

/**
 * Rewrites POSIX single quotes into cmd double quotes.
 *
 * @param command - Hook command after substitution
 * @returns The command with cmd quote syntax
 */
function toCmdQuotes(command: string): string {
  let out = ''
  for (let index = 0; index < command.length; ) {
    const quote = command[index]
    if (quote === "'") {
      const span = readSingleQuoted(command, index)
      out += `"${span.inner.replaceAll('"', '""')}"`
      index = span.next
      continue
    }
    if (quote === '"') {
      const span = readDoubleQuoted(command, index, 'cmd')
      out += span.text
      index = span.next
      continue
    }
    out += quote
    index += 1
  }
  return out
}

/**
 * Rewrites cmd doubled quotes inside a double-quoted span into POSIX escapes.
 *
 * @param command - Hook command after substitution
 * @returns The command with POSIX quote syntax
 */
function toPosixQuotes(command: string): string {
  let out = ''
  for (let index = 0; index < command.length; ) {
    const quote = command[index]
    if (quote === "'") {
      const span = readSingleQuoted(command, index)
      out += `'${span.raw}'`
      index = span.next
      continue
    }
    if (quote === '"') {
      const span = readDoubleQuoted(command, index, 'posix')
      out += span.text
      index = span.next
      continue
    }
    out += quote
    index += 1
  }
  return out
}

/**
 * Reads one POSIX single-quoted span, including the `'\''` idiom.
 *
 * @param command - Hook command
 * @param start - Index of the opening quote
 * @returns The decoded span and the index after it
 */
function readSingleQuoted(
  command: string,
  start: number,
): { inner: string; raw: string; next: number } {
  let inner = ''
  let raw = ''
  let index = start + 1
  while (index < command.length) {
    if (command.startsWith("'\\''", index)) {
      inner += "'"
      raw += "'\\''"
      index += 4
      continue
    }
    if (command[index] === "'") {
      index += 1
      break
    }
    const char = command[index] ?? ''
    inner += char
    raw += char
    index += 1
  }
  return { inner, raw, next: index }
}

/**
 * Reads one double-quoted span and translates quote escapes for the host.
 *
 * @param command - Hook command
 * @param start - Index of the opening quote
 * @param host - Shell that will execute the command
 * @returns The translated span and the index after it
 */
function readDoubleQuoted(
  command: string,
  start: number,
  host: 'posix' | 'cmd',
): { text: string; next: number } {
  let inner = ''
  let index = start + 1
  while (index < command.length) {
    if (host === 'cmd' && command.startsWith('\\"', index)) {
      inner += '""'
      index += 2
      continue
    }
    if (host === 'posix' && command.startsWith('""', index) && hasCloserAfterPair(command, index)) {
      inner += '\\"'
      index += 2
      continue
    }
    if (command[index] === '"') {
      index += 1
      break
    }
    inner += command[index] ?? ''
    index += 1
  }
  return { text: `"${inner}"`, next: index }
}

/**
 * Reports whether another double quote closes the span after a `""` pair.
 *
 * @param command - Hook command
 * @param pairIndex - Index of the `""` pair
 * @returns True when a later `"` closes the span
 */
function hasCloserAfterPair(command: string, pairIndex: number): boolean {
  for (let index = pairIndex + 2; index < command.length; index += 1) {
    if (command.startsWith('""', index)) {
      index += 1
      continue
    }
    if (command[index] === '"') return true
  }
  return false
}
