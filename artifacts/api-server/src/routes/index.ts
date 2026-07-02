import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import tasksRouter from "./tasks";
import contentRouter from "./content";
import eventsRouter from "./events";
import memoriesRouter from "./memories";
import agentsRouter from "./agents";
import contactsRouter from "./contacts";
import activityRouter from "./activity";
import integrationsRouter from "./integrations";
import toolsRouter from "./tools";
import agentBridgeRouter from "./agent-bridge";
import jamesRouter from "./james";
import { requireAdminAuth } from "../lib/auth.js";

const router: IRouter = Router();

router.use(healthRouter);
// Bridge runtime routes remain bearer-token gated inside agent-bridge router.
// Explicitly protect admin bridge routes before mounting bridge router.
router.use("/agents/:id/dispatch", requireAdminAuth);
router.use("/agents/:id/token", requireAdminAuth);
router.use(agentBridgeRouter);
router.use(requireAdminAuth);
router.use(dashboardRouter);
router.use(jamesRouter);
router.use(tasksRouter);
router.use(contentRouter);
router.use(eventsRouter);
router.use(memoriesRouter);
router.use(agentsRouter);
router.use(contactsRouter);
router.use(activityRouter);
router.use(integrationsRouter);
router.use(toolsRouter);

export default router;
