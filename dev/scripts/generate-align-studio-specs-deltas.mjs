#!/usr/bin/env node
/**
 * Generates wave-2+ spec/verify deltas for align-studio-specs-post-merge.
 * Run from repo root: node dev/scripts/generate-align-studio-specs-deltas.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const CHANGE = path.join(
  ROOT,
  'specd-sdd/changes/20260630-171934-align-studio-specs-post-merge',
)

const EXISTING = new Set([
  'sdk:host-context',
  'sdk:composition',
  'api:composition-create-api-server',
  'api:composition-create-api-context',
  'api:composition-graph-provider',
  'api:http-server-bootstrap',
  'api:handler-changes-read',
  'api:handler-graph',
  'studio-desktop:main-kernel-lifecycle',
  'studio-desktop:ipc-handler-registry',
  'studio-desktop:desktop-local-data-adapter',
])

const API_CONSTRAINTS = `## Constraints

- \`@specd/api\` delivery and composition code MUST import host bootstrap and kernel types from \`@specd/sdk\`, not \`@specd/core\` or \`@specd/code-graph\` directly.
- HTTP handlers MUST NOT import \`@specd/core\` from \`@specd/ui\` or \`@specd/client\`.
- v1 server auth: \`api.auth.type\` from \`specd.yaml\` (never \`studio.*\`); registry registers only \`disabled\`; no server-side Bearer enforcement on loopback or \`specd ui serve\`.
- Artifact save/load MUST use \`core:save-change-artifact\` and \`core:get-change-artifact\` — not raw \`ChangeRepository.saveArtifact\` from HTTP handlers.
- There is no \`GET /changes/{name}/validation\` resource; use \`GET .../status\` and \`POST .../validate\`.
- Canonical workspace spec artifacts are read-only in Studio v1.`

const CLIENT_CONSTRAINTS = `## Constraints

- \`@specd/ui\` and \`@specd/client\` MUST NOT import \`@specd/core\` or \`@specd/sdk\` for kernel bootstrap.
- HTTP handlers MUST NOT import \`@specd/core\` from \`@specd/ui\` or \`@specd/client\`.
- v1 server auth: \`api.auth.type\` from \`specd.yaml\` (never \`studio.*\`); registry registers only \`disabled\`; no server-side Bearer enforcement on loopback or \`specd ui serve\`.
- Artifact save/load MUST use \`core:save-change-artifact\` and \`core:get-change-artifact\` — not raw \`ChangeRepository.saveArtifact\` from HTTP handlers.
- There is no \`GET /changes/{name}/validation\` resource; use \`GET .../status\` and \`POST .../validate\`.
- Canonical workspace spec artifacts are read-only in Studio v1.`

const HANDLER_PURPOSE = `## Purpose

HTTP handlers in SpecD Studio. They validate requests, call kernel and graph use cases through \`@specd/sdk\` (\`apiContext.kernel\`, \`apiContext.createGraphProvider\`), and map results through presenters. Business rules live in core use cases — not in this delivery module.`

const PRESENTER_RULE = `### Requirement: presenter does not encode business rules

The presenter MUST NOT decide lifecycle transitions, validation outcomes, or approval state — those belong in core use cases invoked via the SDK kernel surface.`

const SDK_DELIVERY_REQ = `### Requirement: SDK delivery imports

Delivery modules MUST import kernel types, errors, and use-case entry points from \`@specd/sdk\`. They MUST NOT import \`@specd/core\` or \`@specd/code-graph\` directly. Graph operations MUST use \`apiContext.createGraphProvider()\` or \`runIndexProjectGraph\` from \`@specd/sdk\` when applicable.`

const SDK_VERIFY = `- op: added
  position:
    parent:
      type: section
      matches: Requirements
    after:
      type: section
      matches: 'Requirement: SDK delivery imports'
  content: |
    ### Requirement: SDK delivery imports

    #### Scenario: Module imports from SDK not core

    - **WHEN** inspecting delivery module imports for this capability
    - **THEN** kernel and graph orchestration types come from \`@specd/sdk\`
    - **AND** \`@specd/core\` is not imported directly
`

const STUDIO_PURPOSE_OLD =
  /Local mode runs \`createKernel\` in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack\./g

const STUDIO_PURPOSE_NEW =
  'Local mode bootstraps an SDK host context (`createSdkContext`) in the main process and exposes IPC-backed ports; remote mode reuses the HTTP client stack.'

function listSpecs(workspace) {
  const base = path.join(ROOT, 'specs', workspace)
  if (!fs.existsSync(base)) return []
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${workspace}:${e.name}`)
    .filter((id) => fs.existsSync(path.join(base, e.name.replace(`${workspace}:`, ''), 'spec.md')) || fs.existsSync(path.join(base, e.name, 'spec.md')))
}

function listSpecsFixed(workspace) {
  const base = path.join(ROOT, 'specs', workspace)
  if (!fs.existsSync(base)) return []
  return fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'spec.md')))
    .map((e) => `${workspace}:${e.name}`)
}

function writeDelta(specId, specYaml, verifyYaml) {
  const [ws, ...rest] = specId.split(':')
  const cap = rest.join(':')
  const dir = path.join(CHANGE, 'deltas', ws, cap)
  fs.mkdirSync(dir, { recursive: true })
  if (specYaml) fs.writeFileSync(path.join(dir, 'spec.md.delta.yaml'), specYaml)
  if (verifyYaml) fs.writeFileSync(path.join(dir, 'verify.md.delta.yaml'), verifyYaml)
}

function yamlConstraints(content) {
  return `- op: modified
  selector:
    type: section
    matches: Constraints
  content: |
${content
  .split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
`
}

function noOp() {
  return '- op: no-op\n'
}

function capPath(ws, cap) {
  const depth = ws === 'default' ? 2 : 2
  return '../'.repeat(depth)
}

let added = 0

for (const ws of ['api', 'studio-desktop', 'client', 'studio-web']) {
  for (const specId of listSpecsFixed(ws)) {
    if (EXISTING.has(specId)) continue

    const [, cap] = specId.split(/:(.*)/)
    const specPath = path.join(ROOT, 'specs', ws, cap, 'spec.md')
    const text = fs.readFileSync(specPath, 'utf8')
    const hasConstraints = text.includes('## Constraints')
    const isHandler = ws === 'api' && cap.startsWith('handler-')
    const isPresenter = ws === 'api' && cap.startsWith('presenter-')
    const isStudioDesktop = ws === 'studio-desktop'
    const isClient = ws === 'client'
    const isViteHost = specId === 'studio-web:vite-host'

    const specOps = []
    const verifyOps = []

    if (isHandler) {
      specOps.push(`- op: modified
  selector:
    type: section
    matches: Purpose
  content: |
${HANDLER_PURPOSE.split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
`)
      if (hasConstraints) specOps.push(yamlConstraints(API_CONSTRAINTS))
      specOps.push(`- op: added
  position:
    parent:
      type: section
      matches: Requirements
    after:
      type: section
      matches: 'Requirement: failures map to RFC 7807 problem+json'
  content: |
${SDK_DELIVERY_REQ.split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
`)
      verifyOps.push(SDK_VERIFY)
    } else if (isPresenter) {
      if (text.includes('Requirement: presenter does not encode business rules')) {
        specOps.push(`- op: modified
  selector:
    type: section
    matches: 'Requirement: presenter does not encode business rules'
  content: |
${PRESENTER_RULE.split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
`)
      }
      if (hasConstraints) specOps.push(yamlConstraints(API_CONSTRAINTS))
      verifyOps.push(noOp())
    } else if (isStudioDesktop) {
      if (STUDIO_PURPOSE_OLD.test(text)) {
        const purposeMatch = text.match(/## Purpose\n\n([\s\S]*?)\n\n## Requirements/)
        const newBody = (purposeMatch?.[1] ?? '').replace(STUDIO_PURPOSE_OLD, STUDIO_PURPOSE_NEW)
        specOps.push(`- op: modified
  selector:
    type: section
    matches: Purpose
  content: |
    ## Purpose

${newBody
  .split('\n')
  .map((l) => `    ${l}`)
  .join('\n')}
`)
      } else {
        specOps.push(noOp())
      }
      verifyOps.push(noOp())
    } else if (isClient && hasConstraints) {
      specOps.push(yamlConstraints(CLIENT_CONSTRAINTS))
      verifyOps.push(noOp())
    } else if (isViteHost) {
      specOps.push(`- op: modified
  selector:
    type: section
    matches: 'Requirement: host does not bootstrap a Specd kernel'
  content: |
    ### Requirement: host does not bootstrap a Specd kernel

    The Vite host MUST NOT load \`specd.yaml\`, MUST NOT call \`createKernel\` or \`createSdkContext\`, and MUST NOT start an API process — the API is started separately (e.g. \`specd ui serve\`).
`)
      verifyOps.push(noOp())
    } else if (ws === 'api' && hasConstraints) {
      specOps.push(yamlConstraints(API_CONSTRAINTS))
      verifyOps.push(noOp())
    } else if (ws === 'studio-web') {
      verifyOps.push(noOp())
      if (specOps.length === 0) specOps.push(noOp())
    } else {
      specOps.push(noOp())
      verifyOps.push(noOp())
    }

    if (specOps.length === 0) {
      specOps.push(noOp())
      verifyOps.push(noOp())
    }

    writeDelta(specId, `${specOps.join('\n')}\n`, `${verifyOps.join('\n')}\n`)
    added++
    EXISTING.add(specId)
  }
}

const allIds = [...EXISTING]
fs.writeFileSync(path.join(CHANGE, '.generated-spec-ids.json'), JSON.stringify(allIds.sort(), null, 2))
console.log(`Generated deltas for ${added} new specs (${allIds.length} total in scope)`)
