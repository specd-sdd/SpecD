import { registerDynamicLanguage, type DynamicLangRegistrations } from '@ast-grep/napi'
import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)

let registered = false

/**
 * Loads a CJS language grammar module via Node.js require and returns it typed.
 * Uses createRequire to ensure proper CJS resolution even in ESM bundles.
 * @param moduleName - The npm package name to load.
 * @returns The language registration object.
 */
function loadLang(moduleName: string): DynamicLangRegistrations[string] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return nodeRequire(moduleName)
}

/**
 * Registers dynamic tree-sitter language grammars (Python, Go, PHP).
 * Safe to call multiple times — only registers once.
 */
export function ensureLanguagesRegistered(): void {
  if (registered) return
  registered = true

  registerDynamicLanguage({
    python: loadLang('@ast-grep/lang-python'),
    go: loadLang('@ast-grep/lang-go'),
    php: loadLang('@ast-grep/lang-php'),
  })
}
