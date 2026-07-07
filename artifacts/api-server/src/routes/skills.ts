import { Router, type IRouter } from "express";
import { listSkills, readSkill, syncSkills } from "../services/skills.js";

const router: IRouter = Router();

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.get("/skills", async (req, res): Promise<void> => {
  const result = await listSkills({
    name: optionalString(req.query.name),
    category: optionalString(req.query.category),
  });
  res.json(result);
});

router.post("/skills/sync", async (_req, res): Promise<void> => {
  const result = await syncSkills();
  res.json(result);
});

router.get("/skills/:id", async (req, res): Promise<void> => {
  const skill = await readSkill(String(req.params.id));
  if (!skill) {
    res.status(404).json({ error: "Skill not found" });
    return;
  }
  res.json(skill);
});

export default router;
