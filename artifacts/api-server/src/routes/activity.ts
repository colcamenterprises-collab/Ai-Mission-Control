import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, activityTable } from "@workspace/db";
import {
  ListActivityResponse,
  ListActivityQueryParams,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

router.get("/activity", async (req, res): Promise<void> => {
  const query = ListActivityQueryParams.safeParse(req.query);
  const limit = (query.success && query.data.limit) ? Number(query.data.limit) : 20;
  const entries = await db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(limit);
  res.json(ListActivityResponse.parse(serializeDates(entries)));
});

export default router;
