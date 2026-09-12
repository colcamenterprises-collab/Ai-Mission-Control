import { Router, type IRouter } from "express";
import {
  db,
  agentsTable,
  tasksTable,
  projectsTable,
  memoriesTable,
  memoryMetadataTable,
  memoryAgentGrantsTable,
} from "@workspace/db";

const router: IRouter = Router();

type GraphNode = {
  id: string;
  type: "project" | "agent" | "task" | "memory";
  label: string;
  meta?: Record<string, unknown>;
};
type GraphEdge = { id: string; source: string; target: string; type: string };

router.get("/brain/graph", async (_req, res): Promise<void> => {
  const [agents, tasks, projects, memories, metadata, grants] =
    await Promise.all([
      db.select().from(agentsTable),
      db.select().from(tasksTable),
      db.select().from(projectsTable),
      db.select().from(memoriesTable),
      db.select().from(memoryMetadataTable),
      db.select().from(memoryAgentGrantsTable),
    ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const agentByName = new Map(agents.map((agent) => [agent.name, agent.id]));
  const projectByName = new Map(
    projects.map((project) => [project.name, project.id]),
  );

  for (const project of projects)
    nodes.push({
      id: `project:${project.id}`,
      type: "project",
      label: project.name,
      meta: { description: project.description },
    });
  for (const agent of agents)
    nodes.push({
      id: `agent:${agent.id}`,
      type: "agent",
      label: agent.name,
      meta: { role: agent.role, status: agent.status, model: agent.model },
    });
  for (const task of tasks.slice(-250)) {
    nodes.push({
      id: `task:${task.id}`,
      type: "task",
      label: task.title,
      meta: {
        status: task.status,
        assignee: task.assignee,
        project: task.project,
      },
    });
    const projectId = projectByName.get(task.project);
    if (projectId)
      edges.push({
        id: `project-task:${projectId}:${task.id}`,
        source: `project:${projectId}`,
        target: `task:${task.id}`,
        type: "contains",
      });
    const agentId = agentByName.get(task.assignee);
    if (agentId)
      edges.push({
        id: `agent-task:${agentId}:${task.id}`,
        source: `agent:${agentId}`,
        target: `task:${task.id}`,
        type: "assigned",
      });
  }
  for (const memory of memories.slice(-250))
    nodes.push({
      id: `memory:${memory.id}`,
      type: "memory",
      label: memory.title,
      meta: { category: memory.category },
    });

  const metadataByMemory = new Map(metadata.map((row) => [row.memoryId, row]));
  for (const memory of memories.slice(-250)) {
    const row = metadataByMemory.get(memory.id);
    const projectId = row?.project ? projectByName.get(row.project) : undefined;
    if (projectId)
      edges.push({
        id: `project-memory:${projectId}:${memory.id}`,
        source: `project:${projectId}`,
        target: `memory:${memory.id}`,
        type: "knowledge",
      });
  }
  for (const grant of grants) {
    if (
      memories.some((memory) => memory.id === grant.memoryId) &&
      agents.some((agent) => agent.id === grant.agentId)
    ) {
      edges.push({
        id: `memory-agent:${grant.memoryId}:${grant.agentId}`,
        source: `memory:${grant.memoryId}`,
        target: `agent:${grant.agentId}`,
        type: grant.access,
      });
    }
  }

  res.json({
    nodes,
    edges,
    counts: {
      projects: projects.length,
      agents: agents.length,
      tasks: tasks.length,
      memories: memories.length,
    },
  });
});

export default router;
