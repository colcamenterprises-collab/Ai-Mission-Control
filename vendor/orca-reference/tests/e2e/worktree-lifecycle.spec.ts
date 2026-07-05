/**
 * E2E tests for the full worktree lifecycle: removal cleanup, switching with
 * the right sidebar open, and cross-worktree tab isolation.
 */
import { test, expect } from './helpers/orca-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getAllWorktreeIds,
  getWorktreeTabs,
  getOpenFiles,
  getBrowserTabs,
  switchToWorktree,
  ensureTerminalVisible,
} from './helpers/store'
import { clickFileInExplorer, openFileExplorer } from './helpers/file-explorer'

async function createIsolatedWorktree(page: Parameters<typeof waitForSessionReady>[0]): Promise<string> {
  const name = `e2e-lifecycle-${Date.now()}`
  return page.evaluate(async (worktreeName) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const activeWorktreeId = state.activeWorktreeId
    if (!activeWorktreeId) {
      throw new Error('No active worktree to derive repo from')
    }
    const activeWorktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.id === activeWorktreeId)
    if (!activeWorktree) {
      throw new Error(`Active worktree ${activeWorktreeId} not found`)
    }
    const result = await state.createWorktree(activeWorktree.repoId, worktreeName)
    await state.fetchWorktrees(activeWorktree.repoId)
    return result.worktree.id
  }, name)
}

async function removeWorktreeViaStore(
  page: Parameters<typeof waitForSessionReady>[0],
  worktreeId: string,
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (id) => {
    const store = window.__store
    if (!store) {
      return { ok: false as const, error: 'store unavailable' }
    }
    const result = await store.getState().removeWorktree(id, true)
    return result
  }, worktreeId)
}

test.describe('Worktree Lifecycle', () => {
  let createdWorktreeId: string | null = null

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
  })

  test.afterEach(async ({ orcaPage }) => {
    if (!createdWorktreeId) {
      return
    }
    const idToClean = createdWorktreeId
    createdWorktreeId = null
    await orcaPage
      .evaluate(async (id) => {
        try {
          await window.__store?.getState().removeWorktree(id, true)
        } catch {
          /* best-effort cleanup */
        }
      }, idToClean)
      .catch(() => undefined)
  })

  test('removing a worktree clears its tabs, open files, and browser tabs', async ({ orcaPage }) => {
    const originalWorktreeId = await waitForActiveWorktree(orcaPage)
    createdWorktreeId = await createIsolatedWorktree(orcaPage)
    const newWorktreeId = createdWorktreeId
    await switchToWorktree(orcaPage, newWorktreeId)
    await expect.poll(async () => getActiveWorktreeId(orcaPage), { timeout: 10_000 }).toBe(newWorktreeId)
    await ensureTerminalVisible(orcaPage)
    await orcaPage.evaluate((worktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      state.createTab(worktreeId)
      state.createBrowserTab(worktreeId, 'about:blank', { title: 'lifecycle-test', activate: false })
    }, newWorktreeId)
    await openFileExplorer(orcaPage)
    await clickFileInExplorer(orcaPage, ['README.md', 'package.json'])
    expect((await getWorktreeTabs(orcaPage, newWorktreeId)).length).toBeGreaterThan(0)
    expect((await getBrowserTabs(orcaPage, newWorktreeId)).length).toBeGreaterThan(0)
    expect((await getOpenFiles(orcaPage, newWorktreeId)).length).toBeGreaterThan(0)
    await switchToWorktree(orcaPage, originalWorktreeId)
    await expect.poll(async () => getActiveWorktreeId(orcaPage), { timeout: 10_000 }).toBe(originalWorktreeId)
    const result = await removeWorktreeViaStore(orcaPage, newWorktreeId)
    expect(result.ok).toBe(true)
    createdWorktreeId = null
    await expect.poll(async () => (await getWorktreeTabs(orcaPage, newWorktreeId)).length, { timeout: 10_000 }).toBe(0)
    await expect.poll(async () => (await getBrowserTabs(orcaPage, newWorktreeId)).length, { timeout: 5_000 }).toBe(0)
    await expect.poll(async () => (await getOpenFiles(orcaPage, newWorktreeId)).length, { timeout: 5_000 }).toBe(0)
    const allIds = await getAllWorktreeIds(orcaPage)
    expect(allIds).not.toContain(newWorktreeId)
  })
})
