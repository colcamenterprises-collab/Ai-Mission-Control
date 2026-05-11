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

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(tasksRouter);
router.use(contentRouter);
router.use(eventsRouter);
router.use(memoriesRouter);
router.use(agentsRouter);
router.use(contactsRouter);
router.use(activityRouter);
router.use(integrationsRouter);
router.use(toolsRouter);
router.use(agentBridgeRouter);

export default router;
