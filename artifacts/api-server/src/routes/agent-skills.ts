import { Router, type IRouter } from "express";
import { getAgentFromBearer } from "../lib/auth.js";
import { createRateLimit } from "../lib/rate-limit.js";
import { listSkills, readSkill } from "../services/skills.js";
import { listSharedSkills, readSharedSkill } from "../services/shared-skills.js";
import { getAssignedSkillNamesForAgent } from "../config-operational-agents.js";

const router: IRouter = Router();

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isGranted(
  selectors: Set<string>,
  skill: { id: string; name: string },
): boolean {
  return selectors.has(skill.id.toLowerCase()) || selectors.has(skill.name.toLowerCase());
}

router.get(
  "/agent/skills",
  createRateLimit("agent-skills", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const name = optionalString(req.query.name);
    const category = optionalString(req.query.category);
    const selectors = new Set(
      getAssignedSkillNamesForAgent(agent.name).map((skill) => skill.toLowerCase()),
    );
    const [native, shared] = await Promise.all([
      listSkills({ name, category }),
      listSharedSkills(),
    ]);
    const grantedNative = native.skills.filter((skill) => isGranted(selectors, skill));
    const approvedShared = shared.skills.filter((skill) => {
      if (!isGranted(selectors, skill)) return false;
      if (skill.status !== "approved" || skill.source.enabled !== true) return false;
      if (name && !skill.name.toLowerCase().includes(name.toLowerCase()) && !skill.title.toLowerCase().includes(name.toLowerCase())) return false;
      if (category && skill.category.toLowerCase() !== category.toLowerCase()) return false;
      return true;
    });

    res.json({
      agentId: agent.id,
      skills: [...grantedNative, ...approvedShared],
      assignedSkills: [...selectors],
      origins: [...(native.origins ?? native.sources ?? []), ...shared.sources],
      sources: [...(native.sources ?? native.origins ?? []), ...shared.sources],
    });
  },
);

router.get(
  "/agent/skills/:id",
  createRateLimit("agent-skills", 60, 60_000),
  async (req, res): Promise<void> => {
    const agent = await getAgentFromBearer(req.headers.authorization);
    if (!agent) {
      res.status(401).json({ error: "Invalid or missing bearer token" });
      return;
    }

    const selectors = new Set(
      getAssignedSkillNamesForAgent(agent.name).map((skill) => skill.toLowerCase()),
    );
    const id = String(req.params.id);
    if (id.startsWith("vault:")) {
      const skill = await readSharedSkill(id);
      if (!skill || !isGranted(selectors, skill) || skill.status !== "approved" || skill.source.enabled !== true) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json({ agentId: agent.id, skill });
      return;
    }

    const skill = await readSkill(id);
    if (!skill || !isGranted(selectors, skill)) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }
    res.json({ agentId: agent.id, skill });
  },
);

export default router;
