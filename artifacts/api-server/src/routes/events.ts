import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, eventsTable } from "@workspace/db";
import {
  ListEventsResponse,
  CreateEventBody,
  GetEventParams,
  GetEventResponse,
  UpdateEventParams,
  UpdateEventBody,
  UpdateEventResponse,
  DeleteEventParams,
  GetUpcomingEventsResponse,
  ListEventsQueryParams,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

router.get("/events/upcoming", async (_req, res): Promise<void> => {
  const now = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const events = await db.select().from(eventsTable)
    .where(and(gte(eventsTable.startDate, now), lte(eventsTable.startDate, in48h)))
    .orderBy(eventsTable.startDate);
  res.json(GetUpcomingEventsResponse.parse(serializeDates(events)));
});

router.get("/events", async (req, res): Promise<void> => {
  const query = ListEventsQueryParams.safeParse(req.query);
  const filters = [];
  if (query.success) {
    if (query.data.category) filters.push(eq(eventsTable.category, query.data.category));
    if (query.data.start) filters.push(gte(eventsTable.startDate, query.data.start));
    if (query.data.end) filters.push(lte(eventsTable.startDate, query.data.end));
  }
  const events = await db.select().from(eventsTable).where(filters.length ? and(...filters) : undefined).orderBy(eventsTable.startDate);
  res.json(ListEventsResponse.parse(serializeDates(events)));
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [event] = await db.insert(eventsTable).values(parsed.data).returning();
  res.status(201).json(GetEventResponse.parse(serializeDates(event)));
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, params.data.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(GetEventResponse.parse(serializeDates(event)));
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [event] = await db.update(eventsTable).set(parsed.data).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(UpdateEventResponse.parse(serializeDates(event)));
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [event] = await db.delete(eventsTable).where(eq(eventsTable.id, params.data.id)).returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
