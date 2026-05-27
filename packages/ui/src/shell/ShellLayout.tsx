import type {
  ChangeDetailDto,
  ChangeSummaryDto,
  ProjectDto,
  ProjectStatusDto,
  ValidateResultDto,
} from '@specd/client'
import * as React from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import {
  ChangeLifecycleConfirmDialog,
  type LifecycleConfirmKind,
} from '../change/ChangeLifecycleConfirmDialog.js'
import { ChangeMainView } from '../change/ChangeMainView.js'
import { isShelvedReadOnlySection } from '../change/change-list-section.js'
import { flattenWorkspaceSpecIds } from '../change/flatten-spec-ids.js'
import { SpecMainView } from '../spec/SpecMainView.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import type { ChangeView } from '../tabs/ChangeTabs.js'
import { useChangeArtifact } from '../hooks/use-change-artifact.js'
import { useChangesRead } from '../hooks/use-changes-read.js'
import { useGraphStatus } from '../hooks/use-graph-status.js'
import { useWorkspaceSpecsCollection } from '../hooks/use-workspace-specs-collection.js'
import { useSpecRead } from '../hooks/use-spec-read.js'
import { useArchivedChange } from '../hooks/use-archived-change.js'
import { useInspectorSave } from '../hooks/use-inspector-save.js'
import {
  deriveSpecIdFromFilename,
  useChangePreview,
  showsInspectorDiffTab,
  usesSpecPreview,
} from '../hooks/use-change-preview.js'
import {
  runChangeValidation,
  VALIDATE_INVALIDATION_NOTE,
} from '../hooks/use-change-validate.js'
import { useArtifactOutline } from '../hooks/use-artifact-outline.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import {
  studioOutputLevelFromMessage,
  studioOutputProblems,
  useProjectLogs,
  useStudioOutput,
  useStudioPanelActions,
} from '../hooks/use-studio-panel.js'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog.js'
import { ValidateConfirmDialog } from '../components/ValidateConfirmDialog.js'
import type { ValidateConfirmScope } from '../hooks/use-change-validate.js'
import { Circle } from 'lucide-react'
import { ChangesSidebar } from '../sidebar/ChangesSidebar.js'
import { GraphSidebarEntry, WorkspacesSidebar } from '../sidebar/WorkspacesSidebar.js'
import {
  CommandPalette,
  defaultCommandPaletteActions,
} from './CommandPalette.js'
import { StudioLoadingBand } from './StudioLoadingBand.js'
import { StudioTopBar } from './StudioTopBar.js'
import { StatusBar } from './StatusBar.js'
import { ArtifactEditor } from '../editor/ArtifactEditor.js'
import { ArtifactDiffView } from '../editor/ArtifactDiffView.js'
import { ArtifactMarkdownPreview } from '../editor/ArtifactMarkdownPreview.js'
import { cn } from '../lib/cn.js'

export type ShellLayoutProps = {
  project: ProjectDto | undefined
  projectStatus: ProjectStatusDto | undefined
  connectionLabel: string
  runtimeLabel: string
  refreshKey: number
  changes: {
    active: readonly ChangeSummaryDto[]
    drafts: readonly ChangeSummaryDto[]
    archived: readonly ChangeSummaryDto[]
    discarded: readonly ChangeSummaryDto[]
    error?: Error
  }
  loading: {
    active: boolean
    label?: string
  }
}

type CenterContext =
  | { kind: 'change'; name: string; archived?: boolean }
  | { kind: 'spec'; workspace: string; specPath: string }
  | { kind: 'empty' }

type SelectedArtifact =
  | { kind: 'change'; changeName: string; filename: string }
  | { kind: 'spec'; workspace: string; specPath: string; filename: string }

export function ShellLayout({
  project,
  projectStatus,
  connectionLabel,
  runtimeLabel,
  refreshKey,
  changes,
  loading,
}: ShellLayoutProps): React.ReactElement {
  const [centerCtx, setCenterCtx] = React.useState<CenterContext>({ kind: 'empty' })
  const [changeView, setChangeView] = React.useState<ChangeView>('Overview')
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [bottomTab, setBottomTab] = React.useState<'Output' | 'Problems' | 'Logs'>('Output')
  const pollStudioOutput = bottomTab === 'Problems' || bottomTab === 'Output'
  const pollProjectLogs = bottomTab === 'Logs'
  const studioOutput = useStudioOutput(refreshKey, pollStudioOutput)
  const projectLogs = useProjectLogs(refreshKey, pollProjectLogs)
  const { appendOutput, traceAction } = useStudioPanelActions()
  const problems = React.useMemo(
    () => studioOutputProblems(studioOutput.data ?? []),
    [studioOutput.data],
  )
  const outputEntries = studioOutput.data ?? []
  const [validating, setValidating] = React.useState(false)
  const [selectedArtifact, setSelectedArtifact] = React.useState<SelectedArtifact | undefined>()
  const [inspectorMode, setInspectorMode] = React.useState<
    'raw' | 'preview' | 'diff' | 'metadata' | 'outline'
  >('raw')
  const [unsavedPrompt, setUnsavedPrompt] = React.useState<
    { readonly onProceed: () => void } | undefined
  >()
  const [validatePrompt, setValidatePrompt] = React.useState<
    ValidateConfirmScope | undefined
  >()
  // Local editor buffer for unsaved edits; reset when artifact selection changes.
  const [editorBuffer, setEditorBuffer] = React.useState<string | undefined>()
  const port = useSpecdDataPort()

  const refetchStudioOutput = studioOutput.refetch

  const pushOutput = React.useCallback(
    async (message: string, action = 'studio-ui') => {
      await appendOutput({
        message,
        level: studioOutputLevelFromMessage(message),
        action,
      })
      await traceAction(action, { text: message })
      refetchStudioOutput()
      setBottomTab('Output')
    },
    [appendOutput, traceAction, refetchStudioOutput],
  )

  const changeName = centerCtx.kind === 'change' ? centerCtx.name : undefined
  const isArchivedChange = centerCtx.kind === 'change' && centerCtx.archived === true
  const changeListSection = React.useMemo(() => {
    if (!changeName || isArchivedChange) return null
    if (changes.drafts.some((c) => c.name === changeName)) return 'draft' as const
    if (changes.discarded.some((c) => c.name === changeName)) return 'discarded' as const
    if (changes.active.some((c) => c.name === changeName)) return 'active' as const
    return null
  }, [changeName, changes.active, changes.drafts, changes.discarded, isArchivedChange])
  const [lifecycleBusy, setLifecycleBusy] = React.useState(false)
  const [lifecycleConfirm, setLifecycleConfirm] = React.useState<LifecycleConfirmKind | null>(
    null,
  )
  const specWorkspace = centerCtx.kind === 'spec' ? centerCtx.workspace : undefined
  const specPath = centerCtx.kind === 'spec' ? centerCtx.specPath : undefined

  const workspaceSpecs = useWorkspaceSpecsCollection(project?.workspaces ?? [], refreshKey)
  const workspaceSpecIdSuggestions = React.useMemo(
    () => flattenWorkspaceSpecIds(workspaceSpecs.data ?? []),
    [workspaceSpecs.data],
  )
  const isOpenActiveChange =
    !isArchivedChange && centerCtx.kind === 'change' && changeListSection === 'active'
  const pollChangeDetail = isOpenActiveChange && (changeView === 'Overview' || changeView === 'Events')
  const detailPollKey = useTabScopedPollKey(pollChangeDetail, refreshKey)
  const workflowStatusUnavailable =
    isArchivedChange || changeListSection === 'discarded'
  const changeRead = useChangesRead(isArchivedChange ? undefined : changeName, {
    refreshKey: isOpenActiveChange ? refreshKey : undefined,
    detailRefreshKey: pollChangeDetail ? detailPollKey : undefined,
    listSection: changeListSection,
    pollStatus: !workflowStatusUnavailable,
  })
  const archivedRead = useArchivedChange(isArchivedChange ? changeName : undefined)
  const graphStatus = useGraphStatus(refreshKey)

  const changeArtifactFile =
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined
  const changeArtifactName =
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined
  const changeArtifact = useChangeArtifact(
    isArchivedChange ? undefined : changeArtifactName,
    isArchivedChange ? undefined : changeArtifactFile,
    refreshKey,
    { listSection: changeListSection, poll: isOpenActiveChange },
  )

  const specArtifactFilename =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.filename : undefined
  const specArtifactWs =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.workspace : undefined
  const specArtifactPath =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.specPath : undefined
  const specArtifactRead = useSpecRead(specArtifactWs, specArtifactPath, {
    artifactFilename: specArtifactFilename,
    refreshKey,
  })

  const artifactContent =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.data?.content
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.data?.content
        : undefined

  const artifactOriginalHash =
    selectedArtifact?.kind === 'change' ? changeArtifact.data?.originalHash : undefined

  const artifactError =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.error
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.error
        : undefined

  const artifactLoading =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.isLoading
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.isLoading
        : false

  const artifactSelectionKey =
    selectedArtifact === undefined
      ? ''
      : selectedArtifact.kind === 'change'
        ? `change:${selectedArtifact.changeName}:${selectedArtifact.filename}`
        : `spec:${selectedArtifact.workspace}:${selectedArtifact.specPath}:${selectedArtifact.filename}`

  // Reset editor buffer + mode when artifact selection changes.
  React.useEffect(() => {
    setEditorBuffer(undefined)
    setInspectorMode('raw')
  }, [artifactSelectionKey])

  // Sync buffer only when loaded content matches the current selection (avoids stale races).
  React.useEffect(() => {
    if (!artifactSelectionKey || artifactContent === undefined || artifactLoading) {
      return
    }
    setEditorBuffer(artifactContent)
  }, [artifactSelectionKey, artifactContent, artifactLoading])

  const isShelvedReadOnly = isShelvedReadOnlySection(changeListSection)
  const isOpenChangeArtifact =
    selectedArtifact?.kind === 'change' && !isArchivedChange
  const canEditChangeArtifact = isOpenChangeArtifact && !isShelvedReadOnly
  const artifactFilename = selectedArtifact?.filename
  const usesMergedPreview = Boolean(
    isOpenChangeArtifact && artifactFilename && usesSpecPreview(artifactFilename),
  )

  const isDirty = React.useMemo(() => {
    if (!canEditChangeArtifact || artifactContent === undefined || editorBuffer === undefined) {
      return false
    }
    return editorBuffer !== artifactContent
  }, [canEditChangeArtifact, artifactContent, editorBuffer])

  const previewOverrides = React.useMemo(() => {
    if (!isDirty || !artifactFilename || editorBuffer === undefined) {
      return undefined
    }
    return { [artifactFilename]: editorBuffer }
  }, [isDirty, artifactFilename, editorBuffer])

  const needsSpecPreview =
    usesMergedPreview && (inspectorMode === 'preview' || inspectorMode === 'diff')

  const previewHook = useChangePreview(
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    {
      enabled: needsSpecPreview,
      artifactOverrides: previewOverrides,
    },
  )

  const saveHook = useInspectorSave(
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    (dto) => {
      setEditorBuffer(dto.content)
      changeRead.status.refetch()
      if (artifactFilename && deriveSpecIdFromFilename(artifactFilename)) {
        previewHook.refetch()
      }
      void pushOutput(`Saved ${dto.filename}`, 'save-artifact')
    },
  )

  /** Preview: spec/delta paths use spec-preview merged only; proposal/design/tasks use raw buffer. */
  const previewMarkdown = React.useMemo(() => {
    if (usesMergedPreview) {
      return previewHook.data?.merged ?? ''
    }
    return editorBuffer ?? artifactContent ?? ''
  }, [usesMergedPreview, previewHook.data?.merged, editorBuffer, artifactContent])

  const canShowDiff = usesMergedPreview && previewHook.data?.merged !== undefined
  const showDiffTab = showsInspectorDiffTab(artifactFilename)

  const inspectorModes = React.useMemo((): readonly (
    | 'raw'
    | 'preview'
    | 'diff'
    | 'metadata'
    | 'outline'
  )[] => {
    const modes: ('raw' | 'preview' | 'diff' | 'metadata' | 'outline')[] = [
      'raw',
      'preview',
      'metadata',
      'outline',
    ]
    if (showDiffTab) {
      modes.splice(2, 0, 'diff')
    }
    return modes
  }, [showDiffTab])

  React.useEffect(() => {
    if (inspectorMode === 'diff' && !showDiffTab) {
      setInspectorMode(usesMergedPreview ? 'preview' : 'raw')
    }
  }, [artifactSelectionKey, inspectorMode, showDiffTab, usesMergedPreview])

  const outlineContent = editorBuffer ?? artifactContent
  const canOutline = Boolean(
    selectedArtifact &&
      (selectedArtifact.kind === 'change' ||
        (selectedArtifact.kind === 'spec' && specWorkspace && specPath)),
  )
  const artifactOutline = useArtifactOutline({
    enabled: inspectorMode === 'outline' && canOutline,
    kind:
      selectedArtifact?.kind === 'change'
        ? 'change'
        : selectedArtifact?.kind === 'spec'
          ? 'spec'
          : 'none',
    changeName:
      selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    changeFilename:
      selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    workspace: selectedArtifact?.kind === 'spec' ? selectedArtifact.workspace : undefined,
    specPath: selectedArtifact?.kind === 'spec' ? selectedArtifact.specPath : undefined,
    specArtifactFilename:
      selectedArtifact?.kind === 'spec' ? selectedArtifact.filename : undefined,
    content: outlineContent,
    refreshKey: inspectorMode === 'outline' ? refreshKey : undefined,
  })

  const runWithUnsavedGuard = React.useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action()
        return
      }
      setUnsavedPrompt({ onProceed: action })
    },
    [isDirty],
  )

  const closeArtifactPanel = React.useCallback(() => {
    setSelectedArtifact(undefined)
    setEditorBuffer(undefined)
    setInspectorMode('raw')
  }, [])

  const showRightPanel = selectedArtifact !== undefined

  const handleSelectChange = (name: string) => {
    runWithUnsavedGuard(() => {
      setCenterCtx({ kind: 'change', name, archived: false })
      setChangeView('Overview')
      setSelectedArtifact(undefined)
      void pushOutput(`Opened change ${name}`, 'open-change')
    })
  }

  const handleSelectArchivedChange = (name: string) => {
    runWithUnsavedGuard(() => {
      setCenterCtx({ kind: 'change', name, archived: true })
      setChangeView('Overview')
      setSelectedArtifact(undefined)
      void pushOutput(`Opened archived change ${name}`, 'open-change')
    })
  }

  const handleSelectSpec = (workspace: string, path: string) => {
    runWithUnsavedGuard(() => {
      setCenterCtx({ kind: 'spec', workspace, specPath: path })
      setSelectedArtifact(undefined)
      void pushOutput(`Opened spec ${workspace}:${path}`, 'open-spec')
    })
  }

  const handleSelectChangeArtifact = (filename: string) => {
    if (!changeName) return
    runWithUnsavedGuard(() => {
      setSelectedArtifact({ kind: 'change', changeName, filename })
    })
  }

  const handleSelectSpecArtifact = (filename: string) => {
    if (!specWorkspace || !specPath) return
    setSelectedArtifact({ kind: 'spec', workspace: specWorkspace, specPath, filename })
  }

  const executeValidate = React.useCallback(async (scope: ValidateConfirmScope) => {
    const target = changeName ?? changes.active[0]?.name
    if (!target) {
      await appendOutput({
        message: 'Select a change or create one before validating.',
        level: 'error',
        action: 'validate',
      })
      refetchStudioOutput()
      setBottomTab('Problems')
      return
    }
    if (isArchivedChange) {
      await appendOutput({
        message: 'Archived changes are read-only; validation is disabled.',
        level: 'error',
        action: 'validate',
      })
      refetchStudioOutput()
      setBottomTab('Problems')
      return
    }
    setValidating(true)
    try {
      const openFilename =
        scope === 'artifact' &&
        selectedArtifact?.kind === 'change' &&
        selectedArtifact.changeName === target
          ? selectedArtifact.filename
          : undefined
      const result: ValidateResultDto = await runChangeValidation(port, target, {
        ...(openFilename !== undefined ? { filename: openFilename } : {}),
      })
      const scopeLabel =
        openFilename !== undefined ? `${target} (${openFilename})` : `${target} (all specs)`
      const lines: string[] = [
        result.passed
          ? `Validation passed for ${scopeLabel}`
          : `Validation failed for ${scopeLabel}`,
        ...(result.failures ?? []).map((f) => `✗ ${f.message}${f.path ? ` (${f.path})` : ''}`),
        ...(result.warnings ?? []).map((w) => `⚠ ${w}`),
        VALIDATE_INVALIDATION_NOTE,
      ]
      for (const line of lines) {
        await appendOutput({
          message: line,
          level: studioOutputLevelFromMessage(line),
          action: 'validate',
        })
      }
      await traceAction('validate', { scope: scopeLabel, passed: result.passed })
      refetchStudioOutput()
      setBottomTab(
        lines.some((l) => l.startsWith('✗') || l.startsWith('⚠')) ? 'Problems' : 'Output',
      )
      changeRead.status.refetch()
      if (openFilename === undefined) {
        changeRead.detail.refetch()
      }
    } catch (err) {
      await appendOutput({
        message: `✗ ${err instanceof Error ? err.message : String(err)}`,
        level: 'error',
        action: 'validate',
      })
      await traceAction('validate', { error: true })
      refetchStudioOutput()
      setBottomTab('Problems')
    } finally {
      setValidating(false)
    }
  }, [
    port,
    changeName,
    changes.active,
    changeRead.status,
    changeRead.detail,
    archivedRead.data,
    isArchivedChange,
    selectedArtifact,
    appendOutput,
    traceAction,
    refetchStudioOutput,
  ])

  const requestValidate = React.useCallback(
    (scope: ValidateConfirmScope) => {
      const target = changeName ?? changes.active[0]?.name
      if (!target) {
        void appendOutput({
          message: 'Select a change or create one before validating.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          refetchStudioOutput()
          setBottomTab('Problems')
        })
        return
      }
      if (isArchivedChange) {
        void appendOutput({
          message: 'Archived changes are read-only; validation is disabled.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          refetchStudioOutput()
          setBottomTab('Problems')
        })
        return
      }
      if (isShelvedReadOnly) {
        void appendOutput({
          message: 'Drafted and discarded changes are read-only; validation is disabled.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          refetchStudioOutput()
          setBottomTab('Problems')
        })
        return
      }
      setValidatePrompt(scope)
    },
    [changeName, changes.active, isArchivedChange, isShelvedReadOnly, appendOutput, refetchStudioOutput],
  )

  const paletteActions = React.useMemo(
    () =>
      defaultCommandPaletteActions({
        onFocusChanges: () => {
          if (centerCtx.kind !== 'change') {
            setCenterCtx({ kind: 'empty' })
          }
        },
        onFocusWorkspaces: () => {
          if (centerCtx.kind !== 'spec') {
            setCenterCtx({ kind: 'empty' })
          }
        },
        onValidateAll: () => requestValidate('all'),
        onNewChange: () => {
          void pushOutput('New change — wire create dialog (coming soon)', 'new-change')
        },
      }),
    [requestValidate, centerCtx.kind, pushOutput],
  )

  const activeDetail = isArchivedChange ? archivedRead : changeRead.detail
  const detailLoading = activeDetail.isLoading
  const centerLoading = centerCtx.kind === 'change' && changeName && detailLoading

  const validationSummary = React.useMemo(() => {
    if (validating) return 'validating'
    if (problems.some((e) => e.message.startsWith('✗'))) return 'errors'
    if (problems.some((e) => e.message.startsWith('⚠'))) return 'warnings'
    if (problems.length > 0) return 'passed'
    return 'idle'
  }, [problems, validating])

  const refetchOpenChange = React.useCallback(() => {
    if (!isArchivedChange) {
      changeRead.detail.refetch()
      changeRead.status.refetch()
    }
  }, [changeRead.detail, changeRead.status, isArchivedChange])

  const executeLifecycleConfirm = React.useCallback(() => {
    if (!changeName || lifecycleConfirm === null) return

    const actionByKind: Record<
      LifecycleConfirmKind,
      { run: () => Promise<ChangeDetailDto>; outputAction: string }
    > = {
      draft: { run: () => port.draftChange(changeName), outputAction: 'draft-change' },
      restore: { run: () => port.restoreChange(changeName), outputAction: 'restore-change' },
      discard: {
        run: () => port.discardChange(changeName),
        outputAction: 'discard-change',
      },
      archive: { run: () => port.archiveChange(changeName), outputAction: 'archive-change' },
    }

    const { run, outputAction } = actionByKind[lifecycleConfirm]
    setLifecycleConfirm(null)
    setLifecycleBusy(true)
    void (async () => {
      try {
        await run()
        refetchOpenChange()
        void pushOutput(`Lifecycle action completed for ${changeName}`, outputAction)
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err)
        void pushOutput(`✗ ${text}`, outputAction)
      } finally {
        setLifecycleBusy(false)
      }
    })()
  }, [changeListSection, changeName, lifecycleConfirm, port, pushOutput, refetchOpenChange])

  const handleShelfToDrafts = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('draft')
  }, [changeName])

  const handleRestoreToActive = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('restore')
  }, [changeName])

  const handleDiscardChange = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('discard')
  }, [changeName])

  const handleArchiveChange = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('archive')
  }, [changeName])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="studio-shell">
      <StudioTopBar
        onOpenCommandPalette={() => setCommandOpen(true)}
        onNewChange={() => {
          void pushOutput('New change — coming soon', 'new-change')
        }}
      />

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        actions={paletteActions}
      />

      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        {/* ── Sidebar ── */}
        <Panel defaultSize={15} minSize={14} maxSize={28} className="studio-panel border-r border-border">
          <div className="studio-sidebar-stack">
            <section className="studio-sidebar-pane min-h-0 flex-[0.95]">
              <div className="studio-panel-header">Changes</div>
              <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto">
                <ChangesSidebar
                  active={changes.active}
                  drafts={changes.drafts}
                  archived={changes.archived}
                  discarded={changes.discarded}
                  error={changes.error}
                  selected={changeName}
                  onSelect={handleSelectChange}
                  onSelectArchived={handleSelectArchivedChange}
                />
              </div>
            </section>

            <section className="studio-sidebar-pane min-h-0 flex-[1.4]">
              <div className="studio-panel-header">Workspaces</div>
              <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto">
                <WorkspacesSidebar
                  entries={workspaceSpecs.data ?? []}
                  loading={workspaceSpecs.isLoading}
                  selectedWorkspace={specWorkspace}
                  selectedSpecPath={specPath}
                  onSelectSpec={handleSelectSpec}
                />
              </div>
            </section>

            <section className="studio-sidebar-pane">
              <div className="studio-panel-header">Graph</div>
              <div className="p-2">
                <GraphSidebarEntry
                  graphStatus={graphStatus.data}
                  onOpenGraph={() => {
                    setBottomTab('Logs')
                    projectLogs.refetch()
                  }}
                />
              </div>
            </section>
          </div>
        </Panel>

        <PanelResizeHandle className="studio-resize-handle w-px" />

        {/* ── Center + right ── */}
        <Panel minSize={40} className="flex min-w-0 flex-col">
          <PanelGroup direction="vertical" className="min-h-0 flex-1">
            {/* main content row */}
            <Panel defaultSize={75} minSize={30} className="flex min-h-0 flex-col">
              <PanelGroup direction="horizontal" className="min-h-0 flex-1">
                {/* center content */}
                <Panel minSize={20} className="studio-scrollbar flex min-w-0 flex-col">
                  {centerCtx.kind === 'change' ? (
                    <ChangeMainView
                      changeName={changeName}
                      isArchived={isArchivedChange}
                      changeView={changeView}
                      onChangeView={setChangeView}
                      detail={activeDetail.data}
                      detailError={activeDetail.error}
                      detailLoading={detailLoading}
                      status={workflowStatusUnavailable ? undefined : changeRead.status.data}
                      statusError={
                        workflowStatusUnavailable ? undefined : changeRead.status.error
                      }
                      statusLoading={
                        workflowStatusUnavailable ? false : changeRead.status.isLoading
                      }
                      refreshKey={refreshKey}
                      onSelectArtifact={handleSelectChangeArtifact}
                      selectedArtifactFile={
                        selectedArtifact?.kind === 'change'
                          ? selectedArtifact.filename
                          : undefined
                      }
                      onValidateAll={
                        isArchivedChange || isShelvedReadOnly
                          ? undefined
                          : () => requestValidate('all')
                      }
                      specSuggestions={workspaceSpecIdSuggestions}
                      onDescriptionSaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated description for change "${detail.name}"`,
                            'save-description',
                          )
                        }
                      }}
                      onScopeSaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated spec scope & dependencies for "${detail.name}" (${detail.specIds.length} spec(s))`,
                            'save-scope',
                          )
                        }
                      }}
                      onScopeInvalidated={() => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            '⚠ Spec scope updated — approvals may have been invalidated. Review workflow and artifacts.',
                            'scope-invalidate',
                          )
                        }
                      }}
                      onInvalidationPolicySaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated invalidation policy for "${detail.name}" → ${detail.invalidationPolicy ?? 'downstream'}`,
                            'save-invalidation-policy',
                          )
                        }
                      }}
                      changeListSection={changeListSection}
                      lifecycleBusy={lifecycleBusy}
                      onShelfToDrafts={
                        isArchivedChange ? undefined : handleShelfToDrafts
                      }
                      onRestoreToActive={
                        isArchivedChange ? undefined : handleRestoreToActive
                      }
                      onDiscardChange={
                        isArchivedChange ? undefined : handleDiscardChange
                      }
                      onArchiveChange={
                        isArchivedChange ? undefined : handleArchiveChange
                      }
                    />
                  ) : centerCtx.kind === 'spec' ? (
                    <SpecMainView
                      workspace={specWorkspace}
                      specPath={specPath}
                      refreshKey={refreshKey}
                      onSelectArtifact={handleSelectSpecArtifact}
                      selectedArtifactFile={
                        selectedArtifact?.kind === 'spec'
                          ? selectedArtifact.filename
                          : undefined
                      }
                    />
                  ) : (
                    <EmptyCenter />
                  )}
                </Panel>

                {/* right artifact inspector panel */}
                {showRightPanel ? (
                  <>
                    <PanelResizeHandle className="studio-resize-handle w-px" />
                    <Panel
                      defaultSize={50}
                      minSize={20}
                      maxSize={80}
                      className="studio-panel flex flex-col border-l border-border"
                    >
                      {/* inspector header: filename + close */}
                      <div className="studio-panel-header flex shrink-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-xs">
                          {selectedArtifact?.filename}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Close artifact"
                          onClick={() => runWithUnsavedGuard(closeArtifactPanel)}
                        >
                          ✕
                        </button>
                      </div>

                      {/* mode tabs */}
                      <div className="studio-tab-bar shrink-0">
                        {inspectorModes.map((mode) => {
                            const disabled = mode === 'outline' && !canOutline
                            return (
                              <button
                                key={mode}
                                type="button"
                                disabled={disabled}
                                className={cn(
                                  'studio-bottom-tab',
                                  inspectorMode === mode && 'studio-bottom-tab-active',
                                )}
                                onClick={() => !disabled && setInspectorMode(mode)}
                              >
                                {mode === 'raw'
                                  ? canEditChangeArtifact
                                    ? 'Edit'
                                    : isOpenChangeArtifact
                                      ? 'View'
                                      : 'Raw'
                                  : mode === 'preview'
                                    ? 'Preview'
                                    : mode === 'diff'
                                      ? 'Diff'
                                      : mode === 'metadata'
                                        ? 'Metadata'
                                        : 'Outline'}
                              </button>
                            )
                          })}

                        {/* Save + Validate — only for change artifacts */}
                        {canEditChangeArtifact ? (
                          <div className="ml-auto flex items-center gap-[5px]">
                            {isDirty ? (
                              <span title="Unsaved changes">
                                <Circle
                                  className="h-2 w-2 fill-amber-400 text-amber-400"
                                  aria-label="Unsaved changes"
                                />
                              </span>
                            ) : null}
                            {saveHook.conflict ? (
                              <span className="text-[10px] text-destructive">conflict</span>
                            ) : null}
                            <button
                              type="button"
                              disabled={saveHook.isSaving || !artifactOriginalHash}
                              className="m-[5px] rounded px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                              onClick={() => {
                                if (!editorBuffer || !artifactOriginalHash) return
                                void saveHook.save(editorBuffer, artifactOriginalHash)
                              }}
                            >
                              {saveHook.isSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              data-testid="studio-validate-artifact"
                              disabled={validating}
                              className="m-[5px] rounded px-2 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                              onClick={() => requestValidate('artifact')}
                            >
                              Validate
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* 409 conflict banner */}
                      {saveHook.conflict ? (
                        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                          <span className="font-medium">Save conflict.</span> Another process
                          modified this file.{' '}
                          <button
                            type="button"
                            className="underline hover:no-underline"
                            onClick={() => {
                              if (!editorBuffer || !artifactOriginalHash) return
                              void saveHook.forceOverwrite(editorBuffer, artifactOriginalHash)
                            }}
                          >
                            Force overwrite
                          </button>{' '}
                          or{' '}
                          <button
                            type="button"
                            className="underline hover:no-underline"
                            onClick={saveHook.clearConflict}
                          >
                            discard
                          </button>
                          .
                        </div>
                      ) : null}

                      {/* inspector body */}
                      <div className="min-h-0 flex-1">
                        {inspectorMode === 'metadata' ? (
                          <ArtifactMetadataPanel
                            filename={selectedArtifact?.filename}
                            kind={selectedArtifact?.kind ?? 'spec'}
                            originalHash={artifactOriginalHash}
                            content={editorBuffer ?? artifactContent ?? ''}
                          />
                        ) : inspectorMode === 'outline' ? (
                          artifactOutline.isLoading && !artifactOutline.data?.length ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Loading outline…
                            </div>
                          ) : artifactOutline.error ? (
                            <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                              {artifactOutline.error.message}
                            </div>
                          ) : (
                            <pre className="studio-scrollbar h-full overflow-auto p-3 font-mono text-xs text-foreground/90">
                              {artifactOutline.data?.length
                                ? JSON.stringify(artifactOutline.data, null, 2)
                                : 'No outline for this artifact.'}
                            </pre>
                          )
                        ) : inspectorMode === 'diff' ? (
                          usesMergedPreview && previewHook.isLoading && !previewHook.data ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Loading spec-preview…
                            </div>
                          ) : previewHook.error && !previewHook.data ? (
                            <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                              {previewHook.error.message}
                            </div>
                          ) : canShowDiff ? (
                            <ArtifactDiffView
                              filename={selectedArtifact?.filename}
                              original={previewHook.data!.base ?? ''}
                              modified={previewHook.data!.merged}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                              Diff is available for spec deltas in a change (base vs merged).
                            </div>
                          )
                        ) : inspectorMode === 'preview' ? (
                          usesMergedPreview && previewHook.isLoading && !previewHook.data ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Loading spec-preview…
                            </div>
                          ) : previewHook.error && usesMergedPreview && !previewHook.data ? (
                            <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                              {previewHook.error.message}
                            </div>
                          ) : usesMergedPreview && !previewHook.data?.merged ? (
                            <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                              No merged preview for this artifact.
                            </div>
                          ) : (
                            <ArtifactMarkdownPreview content={previewMarkdown} />
                          )
                        ) : artifactError ? (
                          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-destructive">
                            {artifactError.message}
                          </div>
                        ) : artifactLoading ? (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            Loading…
                          </div>
                        ) : (
                          <ArtifactEditor
                            key={artifactSelectionKey}
                            filename={selectedArtifact?.filename}
                            value={editorBuffer ?? ''}
                            readOnly={!canEditChangeArtifact}
                            onChange={canEditChangeArtifact ? setEditorBuffer : undefined}
                          />
                        )}
                      </div>
                    </Panel>
                  </>
                ) : null}
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="studio-resize-handle h-px" />

            {/* bottom panel */}
            <Panel defaultSize={25} minSize={12} className="studio-panel">
              <div className="studio-tab-bar">
                {(['Output', 'Problems', 'Logs'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={cn('studio-bottom-tab', bottomTab === tab && 'studio-bottom-tab-active')}
                    onClick={() => setBottomTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
                {validating ? (
                  <span className="px-2 text-xs text-muted-foreground"> · validating…</span>
                ) : null}
              </div>
              <div className="studio-scrollbar min-h-0 flex-1 overflow-auto p-2 font-mono text-xs">
                <BottomLines
                  entries={
                    bottomTab === 'Problems'
                      ? problems
                      : bottomTab === 'Output'
                        ? outputEntries
                        : undefined
                  }
                  lines={bottomTab === 'Logs' ? projectLogs.lines : undefined}
                  emptyLabel={
                    bottomTab === 'Problems'
                      ? 'Warnings and errors from studio actions appear here.'
                      : bottomTab === 'Output'
                        ? 'Results of saves, validation, and other studio actions appear here.'
                        : 'Recent specd log entries appear here.'
                  }
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      <StudioLoadingBand
        active={loading.active || Boolean(centerLoading) || validating}
        label={
          centerLoading && changeName ? `Loading ${changeName}…` : loading.label
        }
      />
      <StatusBar
        project={project}
        projectStatus={projectStatus}
        connectionLabel={connectionLabel}
        runtimeLabel={runtimeLabel}
        validationSummary={validationSummary}
      />

      <UnsavedChangesDialog
        open={unsavedPrompt !== undefined}
        saving={saveHook.isSaving}
        onCancel={() => setUnsavedPrompt(undefined)}
        onDiscard={() => {
          const proceed = unsavedPrompt?.onProceed
          setUnsavedPrompt(undefined)
          proceed?.()
        }}
        onSave={() => {
          if (!editorBuffer || !artifactOriginalHash) return
          void saveHook.save(editorBuffer, artifactOriginalHash).then((saved) => {
            if (!saved) return
            const proceed = unsavedPrompt?.onProceed
            setUnsavedPrompt(undefined)
            proceed?.()
          })
        }}
      />

      <ValidateConfirmDialog
        open={validatePrompt !== undefined}
        scope={validatePrompt ?? 'all'}
        changeName={changeName ?? changes.active[0]?.name ?? ''}
        filename={
          validatePrompt === 'artifact' &&
          selectedArtifact?.kind === 'change'
            ? selectedArtifact.filename
            : undefined
        }
        validating={validating}
        onCancel={() => setValidatePrompt(undefined)}
        onContinue={() => {
          const scope = validatePrompt ?? 'all'
          setValidatePrompt(undefined)
          void executeValidate(scope)
        }}
      />

      <ChangeLifecycleConfirmDialog
        open={lifecycleConfirm !== null}
        kind={lifecycleConfirm}
        changeName={changeName ?? ''}
        busy={lifecycleBusy}
        onCancel={() => setLifecycleConfirm(null)}
        onConfirm={executeLifecycleConfirm}
      />
    </div>
  )
}

function EmptyCenter(): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
      Select a change or spec from the sidebar
    </div>
  )
}

function ArtifactMetadataPanel({
  filename,
  kind,
  originalHash,
  content,
}: {
  filename: string | undefined
  kind: 'change' | 'spec'
  originalHash: string | undefined
  content: string
}): React.ReactElement {
  const ext = filename?.split('.').pop() ?? ''
  const language = ext === 'yaml' || ext === 'yml' ? 'YAML' : 'Markdown'
  const rows: { label: string; value: string }[] = [
    { label: 'File', value: filename ?? '—' },
    { label: 'Type', value: kind === 'change' ? 'Change artifact' : 'Spec artifact' },
    { label: 'Language', value: language },
    { label: 'Access', value: kind === 'change' ? 'Read / write' : 'Read only' },
    ...(originalHash ? [{ label: 'Hash', value: originalHash.slice(0, 12) + '…' }] : []),
  ]
  const isMetadataFile =
    filename != null &&
    (/metadata\.(ya?ml)$/i.test(filename) || filename.includes('/metadata/'))

  return (
    <div className="studio-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
      <dl className="shrink-0 space-y-3 p-4">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {isMetadataFile && content ? (
        <pre className="min-h-0 flex-1 border-t border-border p-3 font-mono text-xs text-foreground/90">
          {content}
        </pre>
      ) : null}
    </div>
  )
}

function lineTone(message: string): string {
  if (message.startsWith('✗')) {
    return 'text-destructive'
  }
  if (message.startsWith('⚠')) {
    return 'text-amber-400'
  }
  return 'text-foreground'
}

function BottomLines({
  entries,
  lines,
  emptyLabel,
}: {
  entries?: readonly { readonly id: string; readonly message: string }[]
  lines?: readonly string[]
  emptyLabel: string
}): React.ReactElement {
  const rowCount = entries?.length ?? lines?.length ?? 0
  if (rowCount === 0) {
    return <p className="text-muted-foreground">{emptyLabel}</p>
  }

  if (entries !== undefined && entries.length > 0) {
    return (
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id} className={lineTone(entry.message)}>
            {entry.message}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="space-y-1">
      {(lines ?? []).map((line, index) => (
        <li key={`log-${index}`} className={lineTone(line)}>
          {line}
        </li>
      ))}
    </ul>
  )
}
