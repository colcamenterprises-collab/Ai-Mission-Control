/* eslint-disable max-lines */
// Selected Orca reference source copied for Codex Cloud visibility.
// Source path: src/renderer/src/store/slices/worktrees.ts
// Upstream: https://github.com/stablyai/orca

import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { Worktree, WorkspaceVisibleTabType } from '../../../../shared/types'
import { findWorktreeById, applyWorktreeUpdates, getRepoIdFromWorktreeId, type WorktreeSlice } from './worktree-helpers'

export type { WorktreeSlice, WorktreeDeleteState } from './worktree-helpers'

function areWorktreesEqual(current: Worktree[] | undefined, next: Worktree[]): boolean {
  if (!current || current.length !== next.length) {
    return false
  }
  return current.every((worktree, index) => {
    const candidate = next[index]
    return (
      worktree.id === candidate.id &&
      worktree.repoId === candidate.repoId &&
      worktree.path === candidate.path &&
      worktree.head === candidate.head &&
      worktree.branch === candidate.branch &&
      worktree.isBare === candidate.isBare &&
      worktree.isMainWorktree === candidate.isMainWorktree &&
      worktree.displayName === candidate.displayName &&
      worktree.comment === candidate.comment &&
      worktree.linkedIssue === candidate.linkedIssue &&
      worktree.linkedPR === candidate.linkedPR &&
      worktree.isArchived === candidate.isArchived &&
      worktree.isUnread === candidate.isUnread &&
      worktree.sortOrder === candidate.sortOrder &&
      worktree.lastActivityAt === candidate.lastActivityAt
    )
  })
}

export const createWorktreeSlice: StateCreator<AppState, [], [], WorktreeSlice> = (set, get) => ({
  worktreesByRepo: {},
  activeWorktreeId: null,
  deleteStateByWorktreeId: {},
  sortEpoch: 0,
  fetchWorktrees: async (repoId) => {
    try {
      const worktrees = await window.api.worktrees.list({ repoId })
      const current = get().worktreesByRepo[repoId]
      if (areWorktreesEqual(current, worktrees)) {
        return
      }
      set((s) => ({
        // Why: active worktrees can change branches entirely from a terminal.
        // We refresh that live git identity into renderer state, but only bump
        // sortEpoch when git actually reports a different worktree payload.
        worktreesByRepo: { ...s.worktreesByRepo, [repoId]: worktrees },
        sortEpoch: s.sortEpoch + 1,
      }))
    } catch (err) {
      console.error(`Failed to fetch worktrees for repo ${repoId}:`, err)
    }
  },
  fetchAllWorktrees: async () => {
    const { repos } = get()
    await Promise.all(repos.map((r) => get().fetchWorktrees(r.id)))
  },
  createWorktree: async (repoId, name, baseBranch, setupDecision = 'inherit') => {
    try {
      const result = await window.api.worktrees.create({ repoId, name, baseBranch, setupDecision })
      set((s) => ({
        worktreesByRepo: { ...s.worktreesByRepo, [repoId]: [...(s.worktreesByRepo[repoId] ?? []), result.worktree] },
        sortEpoch: s.sortEpoch + 1,
      }))
      return result
    } catch (err) {
      console.error('Failed to create worktree:', err)
      throw err
    }
  },
  // Reference subset intentionally stops before the remainder of Orca's large store slice.
})
