import { createRequire } from 'module'
import {
  CORE_VERSION as _CORE_VERSION,
  SDK_VERSION as _SDK_VERSION,
  CODE_GRAPH_VERSION as _CODE_GRAPH_VERSION,
} from '@specd/sdk'

const _require = createRequire(import.meta.url)

/** Installed version of `@specd/cli`. */
export const CLI_VERSION: string = (_require('../package.json') as { version: string }).version

/** Installed version of `@specd/sdk`. */
export const SDK_VERSION: string = _SDK_VERSION

/** Installed `@specd/core` version (re-exported via `@specd/sdk`). */
export const CORE_VERSION: string = _CORE_VERSION

/** Installed `@specd/code-graph` version (re-exported via `@specd/sdk`). */
export const CODE_GRAPH_VERSION: string = _CODE_GRAPH_VERSION
