#!/usr/bin/env node
import { Command } from 'commander'
import { createConfigLoader } from '@specd/core'
import { handleError } from './handle-error.js'
import { renderBanner } from './banner.js'
import { CLI_VERSION, CORE_VERSION } from './version.js'

// change
import { registerChangeCreate } from './commands/change/create.js'
import { registerChangeList } from './commands/change/list.js'
import { registerChangeStatus } from './commands/change/status.js'
import { registerChangeTransition } from './commands/change/transition.js'
import { registerChangeDraft } from './commands/change/draft.js'
import { registerChangeEdit } from './commands/change/edit.js'
import { registerChangeValidate } from './commands/change/validate.js'
import { registerChangeApprove } from './commands/change/approve.js'
import { registerChangeContext } from './commands/change/context.js'
import { registerChangeArtifacts } from './commands/change/artifacts.js'
import { registerChangeSkipArtifact } from './commands/change/skip-artifact.js'
import { registerChangeDeps } from './commands/change/deps.js'
import { registerChangeDiscard } from './commands/change/discard.js'
import { registerChangeArchive } from './commands/change/archive.js'
import { registerChangeRunHooks } from './commands/change/run-hooks.js'
import { registerChangeHookInstruction } from './commands/change/hook-instruction.js'
import { registerChangeArtifactInstruction } from './commands/change/artifact-instruction.js'
import { registerChangeOverlap } from './commands/change/check-overlap.js'
import { registerChangeSpecPreview } from './commands/change/spec-preview.js'

// drafts
import { registerDraftsList } from './commands/drafts/list.js'
import { registerDraftsShow } from './commands/drafts/show.js'
import { registerDraftsRestore } from './commands/drafts/restore.js'

// discarded
import { registerDiscardedList } from './commands/discarded/list.js'
import { registerDiscardedShow } from './commands/discarded/show.js'

// archive
import { registerArchiveList } from './commands/archive/list.js'
import { registerArchiveShow } from './commands/archive/show.js'

// spec
import { registerSpecList } from './commands/spec/list.js'
import { registerSpecShow } from './commands/spec/show.js'
import { registerSpecContext } from './commands/spec/context.js'
import { registerSpecMetadata } from './commands/spec/metadata.js'
import { registerSpecResolvePath } from './commands/spec/resolve-path.js'
import { registerSpecWriteMetadata } from './commands/spec/write-metadata.js'
import { registerSpecInvalidateMetadata } from './commands/spec/invalidate-metadata.js'
import { registerSpecValidate } from './commands/spec/validate.js'
import { registerSpecGenerateMetadata } from './commands/spec/generate-metadata.js'

// project
import { registerProjectInit } from './commands/project/init.js'
import { registerProjectContext } from './commands/project/context.js'
import { registerProjectUpdate } from './commands/project/update.js'
import { registerProjectDashboard } from './commands/project/dashboard.js'
import { registerProjectStatus } from './commands/project/status.js'

// config
import { registerConfigShow } from './commands/config/show.js'

// schema
import { registerSchemaShow } from './commands/schema/show.js'
import { registerSchemaFork } from './commands/schema/fork.js'
import { registerSchemaExtend } from './commands/schema/extend.js'
import { registerSchemaValidate } from './commands/schema/validate.js'

// graph
import { registerGraphIndex } from './commands/graph/index-graph.js'
import { registerGraphStats } from './commands/graph/stats.js'
import { registerGraphImpact } from './commands/graph/impact.js'
import { registerGraphSearch } from './commands/graph/search.js'
import { registerGraphHotspots } from './commands/graph/hotspots.js'

// plugins
import { registerPluginsInstall } from './commands/plugins/install.js'
import { registerPluginsList } from './commands/plugins/list.js'
import { registerPluginsShow } from './commands/plugins/show.js'
import { registerPluginsUpdate } from './commands/plugins/update.js'
import { registerPluginsUninstall } from './commands/plugins/uninstall.js'

const program = new Command('specd')
  .description(
    'SpecD is a spec-driven development platform. Specs define what the system should do, changes track the lifecycle from design through implementation to verification, and schemas govern artifact structure and workflow. This CLI is typically invoked by AI agent skills — start with /specd to enter the workflow, which routes to /specd-design, /specd-implement, /specd-verify, and other lifecycle skills. All commands are also available for direct manual use.',
  )
  .version(CLI_VERSION)
  .option('--config <path>', 'path to specd.yaml (overrides config discovery)')

program.addHelpText(
  'before',
  renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n',
)

program.hook('preAction', (_thisCommand, actionCommand) => {
  // Commander lifts --config to the root program regardless of where it appears
  // in the command line, so program.opts().config holds the effective value.
  // Propagate it to the action command so opts.config is visible inside action handlers.
  const rootConfig = program.opts().config as string | undefined
  if (rootConfig !== undefined) {
    actionCommand.setOptionValue('config', rootConfig)
  }
})

// ---- change ----
const changeCmd = program
  .command('change')
  .description(
    'Commands for creating, listing, and progressing changes through the specd lifecycle.',
  )
registerChangeCreate(changeCmd)
registerChangeList(changeCmd)
registerChangeStatus(changeCmd)
registerChangeTransition(changeCmd)
registerChangeDraft(changeCmd)
registerChangeEdit(changeCmd)
registerChangeValidate(changeCmd)
registerChangeApprove(changeCmd)
registerChangeContext(changeCmd)
registerChangeArtifacts(changeCmd)
registerChangeSkipArtifact(changeCmd)
registerChangeDeps(changeCmd)
registerChangeDiscard(changeCmd)
registerChangeArchive(changeCmd)
registerChangeRunHooks(changeCmd)
registerChangeHookInstruction(changeCmd)
registerChangeArtifactInstruction(changeCmd)
registerChangeOverlap(changeCmd)
registerChangeSpecPreview(changeCmd)

// ---- drafts ----
const draftsCmd = program
  .command('drafts')
  .description('Commands for browsing and restoring draft changes that have been shelved.')
registerDraftsList(draftsCmd)
registerDraftsShow(draftsCmd)
registerDraftsRestore(draftsCmd)

// ---- discarded ----
const discardedCmd = program
  .command('discarded')
  .description('Commands for listing and inspecting changes that have been discarded.')
registerDiscardedList(discardedCmd)
registerDiscardedShow(discardedCmd)

// ---- archive ----
const archiveCmd = program
  .command('archive')
  .description('Commands for listing and inspecting archived (completed) changes.')
registerArchiveList(archiveCmd)
registerArchiveShow(archiveCmd)

// ---- spec ----
const specCmd = program
  .command('spec')
  .description('Commands for listing, browsing, validating, and managing spec files.')
registerSpecList(specCmd)
registerSpecShow(specCmd)
registerSpecContext(specCmd)
registerSpecMetadata(specCmd)
registerSpecResolvePath(specCmd)
registerSpecWriteMetadata(specCmd)
registerSpecInvalidateMetadata(specCmd)
registerSpecValidate(specCmd)
registerSpecGenerateMetadata(specCmd)

// ---- project ----
const projectCmd = program
  .command('project')
  .description(
    'Commands for initialising, inspecting, and updating the specd project configuration.',
  )
registerProjectInit(projectCmd)
registerProjectContext(projectCmd)
registerProjectUpdate(projectCmd)
registerProjectDashboard(projectCmd)
registerProjectStatus(projectCmd)
registerProjectInit(program)

// ---- config ----
const configCmd = program
  .command('config')
  .description('Commands for inspecting the resolved project configuration.')
registerConfigShow(configCmd)

// ---- schema ----
const schemaCmd = program
  .command('schema')
  .description('Commands for introspecting, forking, extending, and validating schemas.')
registerSchemaShow(schemaCmd)
registerSchemaFork(schemaCmd)
registerSchemaExtend(schemaCmd)
registerSchemaValidate(schemaCmd)

// ---- plugins ----
const pluginsCmd = program
  .command('plugins')
  .description('Commands for installing, listing, showing, updating, and uninstalling plugins.')
registerPluginsInstall(pluginsCmd)
registerPluginsList(pluginsCmd)
registerPluginsShow(pluginsCmd)
registerPluginsUpdate(pluginsCmd)
registerPluginsUninstall(pluginsCmd)

// ---- graph ----
const graphCmd = program.command('graph').description('Code graph intelligence')
registerGraphIndex(graphCmd)
registerGraphStats(graphCmd)
registerGraphImpact(graphCmd)
registerGraphSearch(graphCmd)
registerGraphHotspots(graphCmd)

// ---- default action (no subcommand) ----
// When `specd` is invoked with no subcommand, auto-show the project dashboard
// if a config is discoverable, otherwise fall through to --help.
program.action(async () => {
  const configPath = program.opts().config as string | undefined
  const dashboardArgs = ['project', 'dashboard']

  if (configPath !== undefined) {
    // Explicit --config provided: dispatch directly. The dashboard handles any
    // load error — do not pre-check so that errors are not silently swallowed.
    dashboardArgs.push('--config', configPath)
    await program.parseAsync(dashboardArgs, { from: 'user' })
    return
  }

  // No explicit path — probe for specd.yaml using the same discovery logic as
  // load(), without parsing YAML or throwing on not-found.
  const loader = createConfigLoader({ startDir: process.cwd() })
  const found = await loader.resolvePath()
  if (found === null) {
    program.help()
    return
  }
  await program.parseAsync(dashboardArgs, { from: 'user' })
})

program.parseAsync(process.argv).catch(handleError)
