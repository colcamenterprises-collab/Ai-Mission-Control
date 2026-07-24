import type { agentsTable } from "@workspace/db";
import { decryptSecret } from "../lib/security.js";

export type RuntimeAgent = typeof agentsTable.$inferSelect;

export type RuntimeDispatchInput = {
  instructions: string;
  context?: string | null;
  taskId?: number | null;
  commandId?: number | null;
  mode?: "test" | "work";
};

export type RuntimeDispatchResult = {
  ok: boolean;
  provider: string;
  delivery: "provider" | "webhook" | "none";
  output: string | null;
  statusCode: number | null;
  error: string | null;
};

function cleanProvider(value: string | null | undefined): string {
  return (value ?? "webhook").trim().toLowerCase();
}

function defaultModel(provider: string, model: string | null | undefined): string {
  if (model?.trim()) return model.trim();
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "claude" || provider === "anthropic") return "claude-3-5-sonnet-latest";
  return "default";
}

function buildPrompt(input: RuntimeDispatchInput): string {
  return [
    "You are an AI worker connected to Mission Control.",
    "Complete the assigned work safely, briefly, and report the result clearly.",
    "Do not claim actions you did not perform.",
    input.taskId ? `Task ID: ${input.taskId}` : null,
    input.commandId ? `Command ID: ${input.commandId}` : null,
    "",
    "Instructions:",
    input.instructions,
    input.context ? `\nContext:\n${input.context}` : null,
  ].filter(Boolean).join("\n");
}

async function readResponseText(response: Response): Promise<string> {
  const text = await response.text();
  if (!text.trim()) return "";
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const openAiContent = (json.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content;
    if (openAiContent) return openAiContent;
    const anthropicContent = (json.content as Array<{ text?: string }> | undefined)?.map(part => part.text).filter(Boolean).join("\n");
    if (anthropicContent) return anthropicContent;
    const output = json.output ?? json.result ?? json.message ?? json.response;
    if (typeof output === "string") return output;
    return JSON.stringify(json, null, 2).slice(0, 8000);
  } catch {
    return text.slice(0, 8000);
  }
}

async function dispatchOpenAi(agent: RuntimeAgent, input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const apiKey = decryptSecret(agent.apiKey);
  if (!apiKey) return { ok: false, provider: "openai", delivery: "none", output: null, statusCode: null, error: "OpenAI API key is missing." };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: defaultModel("openai", agent.model),
      messages: [{ role: "user", content: buildPrompt(input) }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(input.mode === "test" ? 10_000 : 60_000),
  });
  const output = await readResponseText(response);
  return { ok: response.ok, provider: "openai", delivery: "provider", output: output || null, statusCode: response.status, error: response.ok ? null : output || `OpenAI returned HTTP ${response.status}` };
}

async function dispatchClaude(agent: RuntimeAgent, input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const apiKey = decryptSecret(agent.apiKey);
  if (!apiKey) return { ok: false, provider: "claude", delivery: "none", output: null, statusCode: null, error: "Claude API key is missing." };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: defaultModel("claude", agent.model),
      max_tokens: input.mode === "test" ? 256 : 1200,
      messages: [{ role: "user", content: buildPrompt(input) }],
    }),
    signal: AbortSignal.timeout(input.mode === "test" ? 10_000 : 60_000),
  });
  const output = await readResponseText(response);
  return { ok: response.ok, provider: "claude", delivery: "provider", output: output || null, statusCode: response.status, error: response.ok ? null : output || `Claude returned HTTP ${response.status}` };
}

async function dispatchWebhook(agent: RuntimeAgent, input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  if (!agent.endpoint) return { ok: false, provider: cleanProvider(agent.provider), delivery: "none", output: null, statusCode: null, error: "Webhook/Hermes endpoint is missing." };
  const apiKey = decryptSecret(agent.apiKey);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(agent.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      commandId: input.commandId ?? null,
      taskId: input.taskId ?? null,
      instructions: input.instructions,
      context: input.context ?? null,
      source: "mission-control",
      mode: input.mode ?? "work",
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(input.mode === "test" ? 10_000 : 60_000),
  });
  const output = await readResponseText(response);
  return { ok: response.ok, provider: cleanProvider(agent.provider), delivery: "webhook", output: output || null, statusCode: response.status, error: response.ok ? null : output || `Webhook returned HTTP ${response.status}` };
}

export async function dispatchRuntime(agent: RuntimeAgent, input: RuntimeDispatchInput): Promise<RuntimeDispatchResult> {
  const provider = cleanProvider(agent.provider);
  try {
    if (provider === "openai") return await dispatchOpenAi(agent, input);
    if (provider === "claude" || provider === "anthropic") return await dispatchClaude(agent, input);
    return await dispatchWebhook(agent, input);
  } catch (error: unknown) {
    return {
      ok: false,
      provider,
      delivery: agent.endpoint ? "webhook" : "provider",
      output: null,
      statusCode: null,
      error: error instanceof Error ? error.message : "Agent runtime dispatch failed.",
    };
  }
}

export function isRuntimeConfigured(agent: RuntimeAgent): boolean {
  const provider = cleanProvider(agent.provider);
  if (provider === "openai" || provider === "claude" || provider === "anthropic") return Boolean(agent.apiKey);
  return Boolean(agent.endpoint);
}
