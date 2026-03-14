#!/usr/bin/env node
import { Command } from 'commander'
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
import { registerProjectOverview } from './commands/project/overview.js'

// config
import { registerConfigShow } from './commands/config/show.js'

// schema
import { registerSchemaShow } from './commands/schema/show.js'
import { registerSchemaFork } from './commands/schema/fork.js'
import { registerSchemaExtend } from './commands/schema/extend.js'

// skills
import { registerSkillsList } from './commands/skills/list.js'
import { registerSkillsShow } from './commands/skills/show.js'
import { registerSkillsInstall } from './commands/skills/install.js'
import { registerSkillsUpdate } from './commands/skills/update.js'

const program = new Command('specd')
  .description('SpecD — spec-driven development CLI')
  .version(CLI_VERSION)
  .option('--hide-banner', 'suppress the SpecD banner')

program.hook('preAction', (_thisCommand, actionCommand) => {
  const hideBanner = (program.opts().hideBanner as boolean | undefined) === true
  const parent = actionCommand.parent?.name()
  const cmd = actionCommand.name()
  const isInit = parent === 'project' && cmd === 'init'
  const isOverview = parent === 'project' && cmd === 'overview'
  const showBanner = isInit || isOverview
  if (!hideBanner && showBanner && (actionCommand.opts().format ?? 'text') === 'text') {
    process.stdout.write(
      renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n',
    )
  }
})

// ---- change ----
const changeCmd = program.command('change').description('Manage changes')
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

// ---- drafts ----
const draftsCmd = program.command('drafts').description('Manage drafted changes')
registerDraftsList(draftsCmd)
registerDraftsShow(draftsCmd)
registerDraftsRestore(draftsCmd)

// ---- discarded ----
const discardedCmd = program.command('discarded').description('View discarded changes')
registerDiscardedList(discardedCmd)
registerDiscardedShow(discardedCmd)

// ---- archive ----
const archiveCmd = program.command('archive').description('View archived changes')
registerArchiveList(archiveCmd)
registerArchiveShow(archiveCmd)

// ---- spec ----
const specCmd = program.command('spec').description('Browse specs')
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
const projectCmd = program.command('project').description('Project management')
registerProjectInit(projectCmd)
registerProjectContext(projectCmd)
registerProjectUpdate(projectCmd)
registerProjectOverview(projectCmd)

// ---- config ----
const configCmd = program.command('config').description('Show resolved config')
registerConfigShow(configCmd)

// ---- schema ----
const schemaCmd = program.command('schema').description('Schema introspection')
registerSchemaShow(schemaCmd)
registerSchemaFork(schemaCmd)
registerSchemaExtend(schemaCmd)

// ---- skills ----
const skillsCmd = program.command('skills').description('Manage agent skills')
registerSkillsList(skillsCmd)
registerSkillsShow(skillsCmd)
registerSkillsInstall(skillsCmd)
registerSkillsUpdate(skillsCmd)

program.parseAsync(process.argv).catch(handleError)
