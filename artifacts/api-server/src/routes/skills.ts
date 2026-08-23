import { Router, type IRouter } from "express";
import { listSkills, readSkill, syncSkills } from "../services/skills.js";
import { listSharedSkills, readSharedSkill, setSharedSkillStatus } from "../services/shared-skills.js";

const router: IRouter = Router();

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.get("/skills", async (req, res): Promise<void> => {
  const filters = { name: optionalString(req.query.name), category: optionalString(req.query.category) };
  let result = await listSkills(filters);
  if (result.skills.length === 0 && !filters.name && !filters.category) {
    try { result = await syncSkills(); }
    catch (error) { console.error("Automatic skill recovery sync failed", error); }
  }
  const shared = await listSharedSkills();
  const sharedSkills = shared.skills.filter((skill) => {
    const nameOk = !filters.name || skill.name.toLowerCase().includes(filters.name.toLowerCase()) || skill.title.toLowerCase().includes(filters.name.toLowerCase());
    const categoryOk = !filters.category || skill.category.toLowerCase() === filters.category.toLowerCase();
    return nameOk && categoryOk;
  });
  res.json({
    ...result,
    skills: [...result.skills, ...sharedSkills],
    origins: [...(result.origins ?? []), ...shared.sources],
    sources: [...(result.sources ?? result.origins ?? []), ...shared.sources],
  });
});

router.post("/skills/sync", async (_req, res): Promise<void> => {
  const result = await syncSkills();
  const shared = await listSharedSkills();
  res.json({
    ...result,
    skills: [...result.skills, ...shared.skills],
    origins: [...(result.origins ?? []), ...shared.sources],
    sources: [...(result.sources ?? result.origins ?? []), ...shared.sources],
  });
});

router.post("/skills/:id/status", async (req, res): Promise<void> => {
  const status = optionalString(req.body?.status);
  if (!status || !["proposed", "needs-review", "approved", "deprecated"].includes(status)) {
    res.status(400).json({ error: "status must be proposed, needs-review, approved, or deprecated" });
    return;
  }
  try {
    const skill = await setSharedSkillStatus(String(req.params.id), status);
    if (!skill) { res.status(404).json({ error: "Shared skill not found" }); return; }
    res.json(skill);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not update shared skill" });
  }
});

router.get("/skills/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const shared = await readSharedSkill(id);
  if (shared) { res.json(shared); return; }
  const skill = await readSkill(id);
  if (!skill) { res.status(404).json({ error: "Skill not found" }); return; }
  res.json(skill);
});

export default router;
