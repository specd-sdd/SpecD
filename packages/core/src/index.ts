export * from './domain/index.js'
export * from './application/index.js'
export * from './composition/index.js'
export { hashFiles } from './composition/hash.js'

import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
/** Installed version of `@specd/core`. */
export const CORE_VERSION: string = (_require('../package.json') as { version: string }).version
