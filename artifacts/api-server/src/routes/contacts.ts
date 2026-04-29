import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";
import {
  ListContactsResponse,
  CreateContactBody,
  GetContactParams,
  GetContactResponse,
  UpdateContactParams,
  UpdateContactBody,
  UpdateContactResponse,
  DeleteContactParams,
  ListContactsQueryParams,
} from "@workspace/api-zod";
import { serializeDates } from "../utils/serialize.js";

const router: IRouter = Router();

router.get("/contacts", async (req, res): Promise<void> => {
  const query = ListContactsQueryParams.safeParse(req.query);
  const filters = [];
  if (query.success) {
    if (query.data.category) filters.push(eq(contactsTable.category, query.data.category));
    if (query.data.search) {
      filters.push(
        or(
          ilike(contactsTable.name, `%${query.data.search}%`),
          ilike(contactsTable.role, `%${query.data.search}%`)
        )!
      );
    }
  }
  const contacts = await db.select().from(contactsTable).where(filters.length ? and(...filters) : undefined).orderBy(contactsTable.name);
  res.json(ListContactsResponse.parse(serializeDates(contacts)));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [contact] = await db.insert(contactsTable).values(parsed.data).returning();
  res.status(201).json(GetContactResponse.parse(serializeDates(contact)));
});

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.json(GetContactResponse.parse(serializeDates(contact)));
});

router.patch("/contacts/:id", async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [contact] = await db.update(contactsTable).set(parsed.data).where(eq(contactsTable.id, params.data.id)).returning();
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.json(UpdateContactResponse.parse(serializeDates(contact)));
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [contact] = await db.delete(contactsTable).where(eq(contactsTable.id, params.data.id)).returning();
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
