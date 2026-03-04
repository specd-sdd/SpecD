import { createRequire } from 'module'
import { CORE_VERSION as _CORE_VERSION } from '@specd/core'

const _require = createRequire(import.meta.url)

/** Installed version of `@specd/cli`. */
export const CLI_VERSION: string = (_require('../package.json') as { version: string }).version

/** Installed version of `@specd/core`. */
export const CORE_VERSION: string = _CORE_VERSION
