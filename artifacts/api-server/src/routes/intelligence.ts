import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  accountHealthTable,
  accountSourcesTable,
  db,
  signalsTable,
  tasksTable,
} from "@workspace/db";
const router: IRouter = Router();
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
router.get("/signals", async (_req, res) => {
  res.json({
    data: await db
      .select()
      .from(signalsTable)
      .orderBy(desc(signalsTable.detectedAt))
      .limit(200),
  });
});
router.post("/signals", async (req, res): Promise<void> => {
  const title = text(req.body?.title);
  const source = text(req.body?.source);
  const category = text(req.body?.category);
  if (
    !title ||
    !source ||
    !category ||
    !Array.isArray(req.body?.evidence) ||
    req.body.evidence.length === 0
  ) {
    res.status(400).json({
      error: "title, source, category and non-empty evidence are required",
    });
    return;
  }
  const [signal] = await db
    .insert(signalsTable)
    .values({
      title,
      source,
      category,
      evidence: req.body.evidence,
      confidence:
        typeof req.body.confidence === "number"
          ? String(req.body.confidence)
          : null,
      business: text(req.body.business),
      project: text(req.body.project),
      severity: text(req.body.severity),
      urgency: text(req.body.urgency),
      actionability: text(req.body.actionability),
      owner: text(req.body.owner),
      detectedAt: req.body.detectedAt
        ? new Date(req.body.detectedAt)
        : new Date(),
    })
    .returning();
  res.status(201).json(signal);
});
router.post("/signals/:id/convert-to-task", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [signal] = await db
    .update(signalsTable)
    .set({ status: "converting" })
    .where(
      and(
        eq(signalsTable.id, id),
        isNull(signalsTable.linkedTaskId),
        inArray(signalsTable.status, ["new", "open"]),
      ),
    )
    .returning();
  if (!signal) {
    const [existing] = await db
      .select()
      .from(signalsTable)
      .where(eq(signalsTable.id, id));
    if (existing?.linkedTaskId) {
      res.json({ taskId: existing.linkedTaskId, duplicate: true });
      return;
    }
    res
      .status(existing ? 409 : 404)
      .json({
        error: existing
          ? "Signal conversion is already in progress or unavailable"
          : "Signal not found",
      });
    return;
  }
  try {
    const [task] = await db
      .insert(tasksTable)
      .values({
        title: signal.title,
        description: `Signal source: ${signal.source}\nEvidence: ${JSON.stringify(signal.evidence)}`,
        assignee: "Unassigned",
        priority: signal.urgency === "critical" ? "critical" : "medium",
        status: "backlog",
        project: signal.project ?? signal.business ?? "UNMAPPED",
      })
      .returning();
    await db
      .update(signalsTable)
      .set({ linkedTaskId: task.id, status: "converted" })
      .where(eq(signalsTable.id, id));
    res.status(201).json({ taskId: task.id, duplicate: false });
  } catch (error) {
    await db
      .update(signalsTable)
      .set({ status: "open" })
      .where(
        and(eq(signalsTable.id, id), eq(signalsTable.status, "converting")),
      );
    throw error;
  }
});
router.get("/client-pulse", async (_req, res) => {
  const [sources, accounts] = await Promise.all([
    db.select().from(accountSourcesTable),
    db.select().from(accountHealthTable),
  ]);
  res.json({
    sources,
    accounts,
    status: sources.some((source) => source.status === "connected")
      ? "CONNECTED"
      : "NOT_CONNECTED",
  });
});
export default router;
