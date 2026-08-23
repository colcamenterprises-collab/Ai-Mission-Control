import { useEffect } from "react";
import "./kanban-review-fixes.css";

/**
 * Final compatibility layer for the Kanban board.
 *
 * Older operating-surface enhancements still listen for wheel events at document
 * capture level. Vertical wheel input belongs to the unified board, while
 * horizontal/shift-wheel input can continue through the legacy horizontal helper.
 * This window-capture guard runs first and preserves the browser's native vertical
 * scrolling without preventing its default action.
 */
export function KanbanReviewFixes() {
  useEffect(() => {
    const preserveBoardVerticalWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const workspace = target?.closest<HTMLElement>(".mc-task-workspace");
      if (!workspace || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.stopPropagation();
    };

    window.addEventListener("wheel", preserveBoardVerticalWheel, { capture: true, passive: true });
    return () => window.removeEventListener("wheel", preserveBoardVerticalWheel, true);
  }, []);

  useEffect(() => {
    const syncUnreadIndicators = () => {
      for (const metrics of Array.from(document.querySelectorAll<HTMLElement>(".mc-task-card-metrics"))) {
        const unread = metrics.querySelector<HTMLElement>("span:first-child");
        if (!unread) continue;
        const count = Number(unread.textContent?.trim().match(/\d+/)?.[0] ?? "0");
        unread.hidden = count <= 0;
      }
    };

    syncUnreadIndicators();
    const observer = new MutationObserver(syncUnreadIndicators);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
