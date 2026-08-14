import { Router, type IRouter } from "express";
import { access } from "node:fs/promises";
import { resolveStoredAttachment } from "../services/upload-storage.js";

const router: IRouter = Router();

router.get("/uploads/:scope/:id/:filename", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const filePath = resolveStoredAttachment(req.params.scope, id, req.params.filename);
  if (!filePath) { res.status(400).json({ error: "Invalid attachment path" }); return; }
  try {
    await access(filePath);
    res.sendFile(filePath);
  } catch {
    res.status(404).json({ error: "Attachment not found" });
  }
});

export default router;
