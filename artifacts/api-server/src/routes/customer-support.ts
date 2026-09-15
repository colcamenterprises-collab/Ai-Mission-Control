import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { asc, eq } from "drizzle-orm";
import { db, taskMessagesTable, tasksTable, workRequestsTable } from "@workspace/db";
import { createRateLimit } from "../lib/rate-limit.js";
import { intakeExternalTask } from "../services/external-intake.js";

const router: IRouter = Router();
const MAX_MESSAGE = 4000;
const MAX_CONTEXT_BYTES = 16_384;

function tokenMatches(actual: string, expected: string): boolean {
  const a=Buffer.from(actual); const b=Buffer.from(expected);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

function requireSupportAuth(req: Request, res: Response, next: NextFunction): void {
  const expected=process.env.MISSION_CONTROL_SUPPORT_TOKEN?.trim();
  if (!expected) { res.status(503).json({error:"Support bridge unavailable"}); return; }
  const bearer=req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : "";
  if (!bearer || !tokenMatches(bearer,expected)) { res.status(401).json({error:"Unauthorized"}); return; }
  next();
}

router.use(requireSupportAuth);
router.use(createRateLimit("restaurant-support",60,60_000));
router.post("/support/intake", async (req, res): Promise<void> => {
  const body=req.body && typeof req.body==="object" ? req.body as Record<string,unknown> : {};
  const requestId=typeof body.requestId==="string" ? body.requestId.trim() : "";
  const organizationId=typeof body.organizationId==="string" ? body.organizationId.trim() : "";
  const userId=typeof body.userId==="string" ? body.userId.trim() : "";
  const message=typeof body.message==="string" ? body.message.trim() : "";
  if (!requestId || !organizationId || !message) { res.status(400).json({error:"requestId, organizationId and message are required"}); return; }
  if (message.length>MAX_MESSAGE) { res.status(413).json({error:"Support message too large"}); return; }
  const diagnostics=body.diagnostics && typeof body.diagnostics==="object" && !Array.isArray(body.diagnostics) ? body.diagnostics as Record<string,unknown> : {};
  const supportContext={organizationId,restaurantName:typeof body.restaurantName==="string"?body.restaurantName:null,locationId:typeof body.locationId==="string"?body.locationId:null,locationName:typeof body.locationName==="string"?body.locationName:null,userRole:typeof body.userRole==="string"?body.userRole:null,diagnostics};
  if (Buffer.byteLength(JSON.stringify(supportContext),"utf8")>MAX_CONTEXT_BYTES) { res.status(413).json({error:"Support context too large"}); return; }
  const result=await intakeExternalTask({source:{channel:"restaurant-support",externalId:requestId,senderId:userId||null,conversationId:organizationId},text:message,project:"Customli Restaurant OS Support",context:supportContext});
  res.status(result.created?201:200).json({taskId:result.task.id,requestId:result.request.id,status:result.task.status,workRequestState:result.request.state,assignedAgent:result.assignedAgentName,approvalDecision:result.assessment.approvalDecision,duplicatePrevented:result.duplicatePrevented});
});

router.get("/support/tickets/:taskId", async (req, res): Promise<void> => {
  const taskId=Number(req.params.taskId);
  if (!Number.isInteger(taskId) || taskId<=0) { res.status(400).json({error:"Invalid task id"}); return; }
  const [task]=await db.select().from(tasksTable).where(eq(tasksTable.id,taskId)).limit(1);
  if (!task || task.project!=="Customli Restaurant OS Support") { res.status(404).json({error:"Support ticket not found"}); return; }
  const [request]=await db.select().from(workRequestsTable).where(eq(workRequestsTable.taskId,taskId)).limit(1);
  const messages=await db.select().from(taskMessagesTable).where(eq(taskMessagesTable.taskId,taskId)).orderBy(asc(taskMessagesTable.createdAt));
  res.json({task:{id:task.id,status:task.status,assignee:task.assignee,report:task.report,updatedAt:task.updatedAt},workRequest:request?{id:request.id,state:request.state,approvalDecision:request.approvalDecision}:null,messages:messages.map(m=>({id:m.id,author:m.author,body:m.body,createdAt:m.createdAt}))});
});

export default router;
