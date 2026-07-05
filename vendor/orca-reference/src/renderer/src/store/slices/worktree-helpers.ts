// Selected Orca reference source copied for Codex Cloud visibility.
// Source path: src/renderer/src/store/slices/worktree-helpers.ts
// Upstream: https://github.com/stablyai/orca

import type {
  CreateWorktreeResult,
  CreateWorktreeArgs,
  CreateSparseCheckoutRequest,
  DetectedWorktree,
  DetectedWorktreeListResult,
  ForceDeleteWorktreeBranchResult,
  GitPushTarget,
  RemoveWorktreeResult,
  SetupDecision,
  TuiAgent,
  WorkspaceCreateTelemetrySource,
  WorkspaceStatus,
  WorkspaceLineage,
  WorktreeStartupLaunch,
  Worktree,
  WorktreeBaseStatusEvent,
  WorktreeLineage,
  WorktreeRemoteBranchConflictEvent,
  WorktreeMeta,
  WorkspaceKey,
} from '../../../../shared/types'
import type { TerminalGitHubPRLink } from '@/lib/terminal-github-pr-link-detector'
import type { PendingWorktreeCreation, WorktreeCreationPhase } from '@/lib/pending-worktree-creation'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'

export { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'

export type WorktreeDeleteState = {
  isDeleting: boolean
  error: string | null
  canForceDelete: boolean
}

export type WorktreeMetaUpdateGuard = (worktree: Worktree | DetectedWorktree | undefined) => boolean
export type WorktreeMetaUpdateOptions = { shouldApply?: WorktreeMetaUpdateGuard }
export type WorktreeRenameRequest = { worktreeId: string; rowKey?: string }

export type WorktreeSlice = {
  worktreesByRepo: Record<string, Worktree[]>
  detectedWorktreesByRepo: Record<string, DetectedWorktree[]>
  worktreeLineageById: Record<string, WorktreeLineage>
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  activeWorktreeId: string | null
  activeWorkspaceKey: WorkspaceKey | null
  deleteStateByWorktreeId: Record<string, WorktreeDeleteState>
  baseStatusByWorktreeId: Record<string, WorktreeBaseStatusEvent>
  remoteBranchConflictByWorktreeId: Record<string, WorktreeRemoteBranchConflictEvent>
  sortEpoch: number
  fetchDetectedWorktrees: (repoId: string) => Promise<DetectedWorktreeListResult>
  fetchWorktrees: (repoId: string, options?: { requireAuthoritative?: boolean }) => Promise<void>
  fetchAllWorktrees: () => Promise<void>
  createWorktree: (
    repoId: string,
    name: string,
    baseBranch?: string,
    setupDecision?: SetupDecision,
    sparseCheckout?: CreateSparseCheckoutRequest,
    telemetrySource?: WorkspaceCreateTelemetrySource,
    displayName?: string,
    linkedIssue?: number,
    linkedPR?: number,
    pushTarget?: GitPushTarget,
    createdWithAgent?: TuiAgent,
    linkedLinearIssue?: string,
    branchNameOverride?: string,
    workspaceStatus?: WorkspaceStatus,
    linkedGitLabMR?: number,
    linkedGitLabIssue?: number,
    startup?: WorktreeStartupLaunch,
    pendingFirstAgentMessageRename?: boolean,
    creationId?: string,
    linkedLinearIssueWorkspaceId?: string | null,
    linkedLinearIssueOrganizationUrlKey?: string | null,
    linkedBitbucketPR?: number | null,
    linkedAzureDevOpsPR?: number | null,
    linkedAzureDevOpsIssue?: number | null,
    linkedGiteaPR?: number | null,
    compareBaseRef?: string,
    options?: { automationProvenanceRequest?: CreateWorktreeArgs['automationProvenanceRequest'] },
  ) => Promise<CreateWorktreeResult>
  removeWorktree: (worktreeId: string, force?: boolean) => Promise<({ ok: true } & RemoveWorktreeResult) | { ok: false; error: string }>
  clearWorktreeDeleteState: (worktreeId: string) => void
  updateWorktreeMeta: (worktreeId: string, updates: Partial<WorktreeMeta>, options?: WorktreeMetaUpdateOptions) => Promise<void>
  markWorktreeUnread: (worktreeId: string) => void
  bumpWorktreeActivity: (worktreeId: string) => void
  setActiveWorktree: (worktreeId: string | null) => void
  allWorktrees: () => Worktree[]
  getKnownWorktreeById: (worktreeId: string) => Worktree | DetectedWorktree | undefined
}
