import { Router, type IRouter } from "express";
import { serializeDates } from "../utils/serialize.js";
import { intakeActionableTask, IntakeValidationError } from "../services/orchestrator-intake.js";

const router: IRouter = Router();

router.post("/orchestrator/intake", async (req, res): Promise<void> => {
  try {
    const result = await intakeActionableTask(req.body);
    res.status(result.created ? 201 : 200).json({
      accepted: true,
      task: serializeDates(result.task),
      orchestratorReview: result.orchestratorReview,
      allocation: result.allocation,
    });
  } catch (error) {
    if (error instanceof IntakeValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;
