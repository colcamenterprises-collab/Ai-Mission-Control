import { Router, type IRouter } from "express";
import { resolveCapabilities } from "../services/capability-router.js";

const router: IRouter = Router();

router.post("/executions", async (req, res, next): Promise<void> => {
  if (Number.isInteger(req.body?.agentId)) {
    next();
    return;
  }

  try {
    const requestedAction = typeof req.body?.requestedAction === "string" ? req.body.requestedAction.trim() : "";
    if (!requestedAction) {
      next();
      return;
    }

    const routing = await resolveCapabilities(requestedAction, req.body?.requirements);
    req.body = {
      ...req.body,
      ...(routing.agentId ? { agentId: routing.agentId } : {}),
      routingReason: routing.routingReason,
      requirements: {
        ...(req.body?.requirements && typeof req.body.requirements === "object" ? req.body.requirements : {}),
        selectedSkills: routing.skills,
        routedAgentName: routing.agentName,
      },
      instructions: routing.skills.map((skill) => ({
        type: "skill",
        id: skill.id,
        name: skill.name,
        version: skill.version,
        provenance: skill.provenance,
        selectionReason: skill.selectionReason,
      })),
    };
    next();
  } catch (error) {
    res.status(503).json({
      error: "Capability routing failed",
      detail: error instanceof Error ? error.message : "Unknown routing failure",
    });
  }
});

export default router;
