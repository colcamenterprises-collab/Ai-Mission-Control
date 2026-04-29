import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import { db, tasksTable, contentTable, eventsTable, agentsTable, activityTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [activeTaskCount] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(eq(tasksTable.status, "in_progress"));

  const [pendingTaskCount] = await db
    .select({ count: count() })
    .from(tasksTable)
    .where(eq(tasksTable.status, "backlog"));

  const contentByStage = await db
    .select({ stage: contentTable.stage, count: sql<number>`count(*)::int` })
    .from(contentTable)
    .groupBy(contentTable.stage);

  const now = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const [upcomingEventCount] = await db
    .select({ count: count() })
    .from(eventsTable)
    .where(and(gte(eventsTable.startDate, now), lte(eventsTable.startDate, in48h)));

  const [activeAgentCount] = await db
    .select({ count: count() })
    .from(agentsTable)
    .where(eq(agentsTable.status, "active"));

  const [recentActivityCount] = await db
    .select({ count: count() })
    .from(activityTable);

  const summary = {
    activeTaskCount: activeTaskCount?.count ?? 0,
    pendingTaskCount: pendingTaskCount?.count ?? 0,
    contentByStage,
    upcomingEventCount: upcomingEventCount?.count ?? 0,
    activeAgentCount: activeAgentCount?.count ?? 0,
    recentActivityCount: recentActivityCount?.count ?? 0,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;
