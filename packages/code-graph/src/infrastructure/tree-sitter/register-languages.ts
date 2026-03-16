import { registerDynamicLanguage, type DynamicLangRegistrations } from '@ast-grep/napi'
import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)

let registered = false

/**
 * Loads a CJS language grammar module via Node.js require and returns it typed.
 * Uses createRequire to ensure proper CJS resolution even in ESM bundles.
 * @param moduleName - The npm package name to load.
 * @returns The language registration object, or undefined if the module is not installed.
 */
function loadLang(moduleName: string): DynamicLangRegistrations[string] | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return nodeRequire(moduleName)
  } catch {
    return undefined
  }
}

/**
 * Registers dynamic tree-sitter language grammars (Python, Go, PHP).
 * Safe to call multiple times — only registers once.
 * Grammars that are not installed are silently skipped.
 */
export function ensureLanguagesRegistered(): void {
  if (registered) return
  registered = true

  const langs: DynamicLangRegistrations = {}
  const python = loadLang('@ast-grep/lang-python')
  if (python) langs.python = python
  const go = loadLang('@ast-grep/lang-go')
  if (go) langs.go = go
  const php = loadLang('@ast-grep/lang-php')
  if (php) langs.php = php

  if (Object.keys(langs).length > 0) {
    registerDynamicLanguage(langs)
  }
}
