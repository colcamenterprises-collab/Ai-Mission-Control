import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  RefreshCw,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JamesAvatar } from "@/components/james-avatar";
import { type AgentStatusKey, jamesIdentity } from "@/lib/agent-identities";

type JamesStatus = {
  binaryPath: string;
  exists: boolean;
  versionWorks: boolean;
  status: "online" | "offline";
  version: string | null;
  error: string | null;
};

type JamesJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled";

type JamesJob = {
  id: string;
  status: JamesJobStatus;
  message: string;
  project: string | null;
  environment: string | null;
  workspacePath: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  error: string | null;
  logs: { timestamp: string; type: string; message: string }[];
};

type JamesJobsResponse = {
  jobs: JamesJob[];
  note: string;
};

type JamesJobStartResponse = {
  jobId: string;
  status: JamesJobStatus;
};

type JamesResponse = {
  success: boolean;
  response?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  timedOut?: boolean;
  error?: string;
  details?: string;
};

type ExecutionDetails = {
  success: boolean;
  exitCode?: number | null;
  durationMs?: number;
  timedOut?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  details?: string;
};

type ChatMessage = {
  role: "user" | "james" | "error";
  content: string;
  timestamp: string;
  execution?: ExecutionDetails;
};

type JamesProject = "Mission Control" | "SBB App Staging" | "Hermes";
type JamesEnvironment = "Read Only" | "Staging" | "Production Locked";

type JamesProjectContext = {
  project: JamesProject;
  environment: JamesEnvironment;
};

type AdminTokenSource = "localStorage" | "env" | "fallback";

type AdminToken = {
  source: AdminTokenSource;
  value: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const CHAT_HISTORY_STORAGE_KEY = "mission-control:james-chat-history";
const PROJECT_CONTEXT_STORAGE_KEY = "mission-control:james-project-context";
const MVP_FALLBACK_ADMIN_TOKEN = "change-this-later";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() ?? "").replace(
  /\/$/,
  "",
);
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const POLL_REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const JAMES_PROJECTS: JamesProject[] = [
  "Mission Control",
  "SBB App Staging",
  "Hermes",
];
const JAMES_ENVIRONMENTS: JamesEnvironment[] = [
  "Read Only",
  "Staging",
  "Production Locked",
];
const DEFAULT_PROJECT_CONTEXT: JamesProjectContext = {
  project: "Mission Control",
  environment: "Read Only",
};
const WORKSPACE_PATH = "/opt/apps/ai-mission-control";
const JAMES_SAFETY_RULES = [
  "SBB production requires explicit approval",
  "inspect before changing",
  "report files changed and commands run",
];

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

class ApiRequestError extends Error {
  readonly status?: number;
  readonly code: "api" | "network" | "timeout" | "parse";
  readonly details?: string;
  readonly retryable: boolean;

  constructor({
    message,
    status,
    code,
    details,
    retryable,
  }: {
    message: string;
    status?: number;
    code: ApiRequestError["code"];
    details?: string;
    retryable: boolean;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryRequest(error: unknown, method: string): boolean {
  if (!["GET", "HEAD"].includes(method.toUpperCase())) return false;
  if (error instanceof ApiRequestError) return error.retryable;
  return false;
}

function formatApiError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (error.code === "network") {
    return `Network error while contacting James API${API_BASE_URL ? ` at ${API_BASE_URL}` : ""}: ${error.message}`;
  }

  if (error.code === "timeout") {
    return `Timed out contacting James API after retrying: ${error.message}`;
  }

  if (error.status === 401 || error.status === 403) {
    return `Authentication failed (${error.status}): ${error.message}`;
  }

  if (error.status) {
    return `James API error (${error.status}): ${error.message}`;
  }

  return error.message || fallback;
}

async function apiFetch(
  path: string,
  {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retries = 0,
    ...init
  }: ApiRequestOptions = {},
): Promise<Response> {
  const method = init.method ?? "GET";
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(apiUrl(path), {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (
        RETRYABLE_STATUS_CODES.has(response.status) &&
        attempt < retries &&
        ["GET", "HEAD"].includes(method.toUpperCase())
      ) {
        await wait(500 * 2 ** attempt);
        continue;
      }

      return response;
    } catch (error) {
      window.clearTimeout(timeoutId);
      const isTimeout =
        error instanceof DOMException && error.name === "AbortError";
      lastError = new ApiRequestError({
        message: isTimeout
          ? `${method} ${apiUrl(path)} exceeded ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : `Unable to reach ${apiUrl(path)}`,
        code: isTimeout ? "timeout" : "network",
        retryable: true,
      });

      if (attempt >= retries || !shouldRetryRequest(lastError, method)) break;
      await wait(500 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiRequestError({
        message: `Unable to reach ${apiUrl(path)}`,
        code: "network",
        retryable: true,
      });
}

function isJamesProject(value: unknown): value is JamesProject {
  return (
    typeof value === "string" && JAMES_PROJECTS.includes(value as JamesProject)
  );
}

function isJamesEnvironment(value: unknown): value is JamesEnvironment {
  return (
    typeof value === "string" &&
    JAMES_ENVIRONMENTS.includes(value as JamesEnvironment)
  );
}

function readProjectContext(): JamesProjectContext {
  const storedContext = localStorage.getItem(PROJECT_CONTEXT_STORAGE_KEY);
  if (!storedContext) return DEFAULT_PROJECT_CONTEXT;

  try {
    const parsedContext = JSON.parse(storedContext);
    if (parsedContext === null || typeof parsedContext !== "object")
      return DEFAULT_PROJECT_CONTEXT;

    return {
      project: isJamesProject(parsedContext.project)
        ? parsedContext.project
        : DEFAULT_PROJECT_CONTEXT.project,
      environment: isJamesEnvironment(parsedContext.environment)
        ? parsedContext.environment
        : DEFAULT_PROJECT_CONTEXT.environment,
    };
  } catch {
    return DEFAULT_PROJECT_CONTEXT;
  }
}

function createContextMessage(
  message: string,
  context: JamesProjectContext,
): string {
  return [
    "Mission Control workspace context:",
    `Selected project: ${context.project}`,
    `Selected environment: ${context.environment}`,
    `Workspace path: ${WORKSPACE_PATH}`,
    "Current safety rules:",
    ...JAMES_SAFETY_RULES.map((rule) => `- ${rule}`),
    "",
    "User message:",
    message,
  ].join("\n");
}

function readAdminToken(): AdminToken {
  const storedToken =
    localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ||
    localStorage.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY)?.trim();
  if (storedToken) {
    return { source: "localStorage", value: storedToken };
  }

  const envToken = import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim();
  if (envToken) {
    return { source: "env", value: envToken };
  }

  return { source: "fallback", value: MVP_FALLBACK_ADMIN_TOKEN };
}

function authHeaders(): HeadersInit {
  const token = readAdminToken();
  return { Authorization: `Bearer ${token.value}` };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = {};

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new ApiRequestError({
        message: `Invalid JSON from James API: ${
          error instanceof Error ? error.message : "Unable to parse response"
        }`,
        status: response.status,
        code: "parse",
        retryable: response.ok,
      });
    }
  }

  if (!response.ok) {
    const body = data !== null && typeof data === "object" ? data : {};
    const error =
      "error" in body && typeof body.error === "string"
        ? body.error
        : "message" in body && typeof body.message === "string"
          ? body.message
          : response.statusText || `Request failed with ${response.status}`;
    const details =
      "details" in body && typeof body.details === "string"
        ? body.details
        : "code" in body && typeof body.code === "string"
          ? body.code
          : undefined;
    throw new ApiRequestError({
      message: details ? `${error}: ${details}` : error,
      status: response.status,
      code: "api",
      details,
      retryable: RETRYABLE_STATUS_CODES.has(response.status),
    });
  }

  return data as T;
}

function readChatHistory(): ChatMessage[] {
  const storedHistory = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
  if (!storedHistory) return [];

  try {
    const parsedHistory = JSON.parse(storedHistory);
    if (!Array.isArray(parsedHistory)) return [];

    return parsedHistory.filter((message): message is ChatMessage => {
      return (
        message !== null &&
        typeof message === "object" &&
        ["user", "james", "error"].includes(message.role) &&
        typeof message.content === "string" &&
        typeof message.timestamp === "string"
      );
    });
  } catch {
    return [];
  }
}

function extractJamesResponse(response: JamesResponse): string {
  if (response.response?.trim()) return response.response;
  if (response.stdout?.trim()) return response.stdout;
  if (response.stderr?.trim()) return response.stderr;

  return JSON.stringify(response, null, 2);
}

function createExecutionDetails(response: JamesResponse): ExecutionDetails {
  return {
    success: response.success,
    exitCode: response.exitCode,
    durationMs: response.durationMs,
    timedOut: response.timedOut,
    stdout: response.stdout,
    stderr: response.stderr,
    error: response.error,
    details: response.details,
  };
}

function createExecutionDetailsFromJob(job: JamesJob): ExecutionDetails {
  const success = job.status === "completed";
  return {
    success,
    exitCode: job.exitCode,
    durationMs: job.durationMs ?? undefined,
    timedOut: job.status === "timed_out",
    stdout: job.stdout,
    stderr: job.stderr,
    error: job.error ?? undefined,
    details: `Background job ${job.id} finished with status ${job.status}.`,
  };
}

function extractJobResponse(job: JamesJob): string {
  if (job.stdout.trim()) return job.stdout;
  if (job.stderr.trim()) return job.stderr;
  if (job.error?.trim()) return job.error;
  return `Background job ${job.id} completed with status ${job.status}.`;
}

function isJobFinished(status: JamesJobStatus): boolean {
  return ["completed", "failed", "timed_out", "cancelled"].includes(status);
}

function createChatMessage(
  role: ChatMessage["role"],
  content: string,
  execution?: ExecutionDetails,
): ChatMessage {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
    execution,
  };
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString();
}

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== "number") return "unknown time";
  return `${(durationMs / 1000).toFixed(durationMs < 1000 ? 2 : 1)}s`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a class="underline underline-offset-2" href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

type MarkdownSegment =
  | { type: "code"; content: string; language: string }
  | { type: "text"; content: string };

function splitMarkdownSegments(content: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const fencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex)
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    segments.push({
      type: "code",
      language: match[1]?.trim() ?? "",
      content: match[2] ?? "",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length)
    segments.push({ type: "text", content: content.slice(lastIndex) });
  return segments.length ? segments : [{ type: "text", content }];
}

function MarkdownMessage({ content }: { content: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyCode = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1500);
  };

  return (
    <div className="space-y-2 break-words leading-[1.5]">
      {splitMarkdownSegments(content).map((segment, index) => {
        if (segment.type === "code") {
          return (
            <div
              key={index}
              className="overflow-hidden rounded-md border border-border bg-muted/50"
            >
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground">
                <span className="font-mono uppercase">
                  {segment.language || "code"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void copyCode(segment.content, index)}
                >
                  {copiedIndex === index ? (
                    <Check className="mr-1 h-3 w-3" />
                  ) : (
                    <Copy className="mr-1 h-3 w-3" />
                  )}
                  {copiedIndex === index ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-[1.5]">
                <code>{segment.content}</code>
              </pre>
            </div>
          );
        }

        return (
          <div
            key={index}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: renderInlineMarkdown(segment.content),
            }}
          />
        );
      })}
    </div>
  );
}

function ExecutionDetailsBlock({ details }: { details: ExecutionDetails }) {
  const summary = details.success ? "🟢 Completed" : "🔴 Failed";

  return (
    <details className="mt-2 rounded-md bg-background/40 text-[12px] ring-1 ring-border/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-muted-foreground">
        <span>{summary}</span>
        <ChevronDown className="h-3 w-3" />
      </summary>
      <div className="space-y-2 border-t border-border/50 p-3">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Exit code</dt>
            <dd className="font-mono">{details.exitCode ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="font-mono">{formatDuration(details.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Timed out</dt>
            <dd>{details.timedOut ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{details.success ? "Success" : "Failed"}</dd>
          </div>
        </dl>
        {details.error ? (
          <div>
            <div className="text-muted-foreground">Error</div>
            <pre className="whitespace-pre-wrap font-mono">{details.error}</pre>
          </div>
        ) : null}
        {details.details ? (
          <div>
            <div className="text-muted-foreground">Details</div>
            <pre className="whitespace-pre-wrap font-mono">
              {details.details}
            </pre>
          </div>
        ) : null}
        {details.stdout ? (
          <div>
            <div className="text-muted-foreground">stdout</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">
              {details.stdout}
            </pre>
          </div>
        ) : null}
        {details.stderr ? (
          <div>
            <div className="text-muted-foreground">stderr</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">
              {details.stderr}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export default function James() {
  const [status, setStatus] = useState<JamesStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() =>
    readChatHistory(),
  );
  const [projectContext, setProjectContext] = useState<JamesProjectContext>(
    () => readProjectContext(),
  );
  const [isSending, setIsSending] = useState(false);
  const [jobs, setJobs] = useState<JamesJob[]>([]);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  const [didLastRequestFail, setDidLastRequestFail] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    setStatusError(null);
    try {
      const nextStatus = await readJson<JamesStatus>(
        await apiFetch("/api/james/status", {
          headers: authHeaders(),
          retries: 2,
        }),
      );
      setStatus(nextStatus);
    } catch (error) {
      setStatus(null);
      setStatusError(formatApiError(error, "Unable to load James status"));
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const loadJobs = async () => {
    const result = await readJson<JamesJobsResponse>(
      await apiFetch("/api/james/jobs", { headers: authHeaders(), retries: 2 }),
    );
    setJobs(result.jobs);
    setActiveJobIds(
      result.jobs
        .filter((job) => !isJobFinished(job.status))
        .map((job) => job.id),
    );
  };

  useEffect(() => {
    const refreshJamesApiState = () => {
      void loadStatus();
      void loadJobs().catch((error) => {
        setStatusError(formatApiError(error, "Unable to load James jobs"));
      });
    };

    refreshJamesApiState();
    window.addEventListener("online", refreshJamesApiState);

    return () => window.removeEventListener("online", refreshJamesApiState);
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem(
      PROJECT_CONTEXT_STORAGE_KEY,
      JSON.stringify(projectContext),
    );
  }, [projectContext]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatHistory, isSending]);

  useEffect(() => {
    if (activeJobIds.length === 0) return;

    const intervalId = window.setInterval(() => {
      activeJobIds.forEach((jobId) => {
        void apiFetch(`/api/james/jobs/${jobId}`, {
          headers: authHeaders(),
          retries: 2,
          timeoutMs: POLL_REQUEST_TIMEOUT_MS,
        })
          .then((response) => readJson<JamesJob>(response))
          .then((job) => {
            setJobs((currentJobs) => [
              job,
              ...currentJobs.filter((currentJob) => currentJob.id !== job.id),
            ]);
            if (!isJobFinished(job.status)) return;

            setActiveJobIds((currentIds) =>
              currentIds.filter((currentId) => currentId !== job.id),
            );
            setDidLastRequestFail(job.status !== "completed");
            setChatHistory((currentHistory) => [
              ...currentHistory,
              createChatMessage(
                job.status === "completed" ? "james" : "error",
                extractJobResponse(job),
                createExecutionDetailsFromJob(job),
              ),
            ]);
          })
          .catch((error) => {
            setDidLastRequestFail(true);
            setStatusError(formatApiError(error, "Unable to poll James job"));
          });
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [activeJobIds]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [message]);

  const sendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    const messageWithContext = createContextMessage(
      trimmedMessage,
      projectContext,
    );
    const userMessage = createChatMessage("user", trimmedMessage);
    setChatHistory((currentHistory) => [...currentHistory, userMessage]);
    setMessage("");
    setIsSending(true);
    setDidLastRequestFail(false);

    try {
      const result = await readJson<JamesResponse>(
        await apiFetch("/api/james/message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ message: messageWithContext }),
        }),
      );
      setDidLastRequestFail(!result.success);
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage(
          result.success ? "james" : "error",
          extractJamesResponse(result),
          createExecutionDetails(result),
        ),
      ]);
    } catch (error) {
      setDidLastRequestFail(true);
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage(
          "error",
          formatApiError(error, "Unable to send message to James"),
        ),
      ]);
    } finally {
      setIsSending(false);
      window.setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  const runBackgroundJob = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    const messageWithContext = createContextMessage(
      trimmedMessage,
      projectContext,
    );
    setChatHistory((currentHistory) => [
      ...currentHistory,
      createChatMessage("user", trimmedMessage),
      createChatMessage("james", "Job starting as a background job..."),
    ]);
    setMessage("");
    setDidLastRequestFail(false);

    try {
      const result = await readJson<JamesJobStartResponse>(
        await apiFetch("/api/james/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            message: messageWithContext,
            project: projectContext.project,
            environment: projectContext.environment,
            workspacePath: WORKSPACE_PATH,
          }),
        }),
      );
      setActiveJobIds((currentIds) =>
        Array.from(new Set([...currentIds, result.jobId])),
      );
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage(
          "james",
          `Job started. Job ID: ${result.jobId}. Status: ${result.status}.`,
        ),
      ]);
      await loadJobs();
    } catch (error) {
      setDidLastRequestFail(true);
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage(
          "error",
          formatApiError(error, "Unable to start James background job"),
        ),
      ]);
    } finally {
      window.setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  const cancelJob = async (jobId: string) => {
    await readJson<{ status: JamesJobStatus }>(
      await apiFetch(`/api/james/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: authHeaders(),
      }),
    );
    await loadJobs();
  };

  const clearChat = () => {
    setChatHistory([]);
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void sendMessage();
  };

  const isOnline = status?.status === "online";
  const jamesStatusKey: AgentStatusKey = isSending
    ? "thinking"
    : didLastRequestFail || statusError || status?.error
      ? "error"
      : isOnline
        ? "online"
        : status
          ? "offline"
          : "waiting";
  const jamesStatus = jamesIdentity.statuses[jamesStatusKey];
  const jamesStatusVariant =
    jamesStatusKey === "error" ? "destructive" : "default";

  const updateProject = (project: JamesProject) => {
    setProjectContext((currentContext) => ({ ...currentContext, project }));
  };

  const updateEnvironment = (environment: JamesEnvironment) => {
    setProjectContext((currentContext) => ({ ...currentContext, environment }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-[13px] leading-[1.5] sm:text-sm">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-background/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="sr-only">Orchestrator chat with James</span>
          <Badge
            variant={jamesStatusVariant}
            className="h-8 shrink-0 gap-1.5 px-2 text-[12px] font-medium"
          >
            <JamesAvatar
              className="h-6 w-6 rounded-full object-cover ring-1 ring-background/70"
              fallbackClassName="text-current"
            />
            <span>Orchestrator</span>
            <span className="text-muted-foreground">Agent: {jamesIdentity.name}</span>
            <span aria-hidden="true">{jamesStatus.indicator}</span>
            <span>{jamesStatus.label}</span>
          </Badge>
          <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[12px] text-muted-foreground">
            Current orchestrator agent: {jamesIdentity.name}
          </span>
          <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[12px] text-muted-foreground">
            Permission mode: {projectContext.environment}
          </span>
          <Select
            value={projectContext.project}
            onValueChange={(value) => updateProject(value as JamesProject)}
          >
            <SelectTrigger
              id="james-project-context"
              aria-label="Selected project"
              className="h-7 w-[9.25rem] min-w-0 px-2 text-[12px] sm:w-[10.5rem]"
            >
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              sideOffset={4}
              align="start"
              className="max-w-[min(18rem,calc(100vw-1rem))]"
            >
              {JAMES_PROJECTS.map((project) => (
                <SelectItem key={project} value={project}>
                  {project}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={projectContext.environment}
            onValueChange={(value) =>
              updateEnvironment(value as JamesEnvironment)
            }
          >
            <SelectTrigger
              id="james-environment-context"
              aria-label="Selected environment"
              className="h-7 w-[8.5rem] min-w-0 px-2 text-[12px] sm:w-[10rem]"
            >
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              sideOffset={4}
              align="start"
              className="max-w-[min(18rem,calc(100vw-1rem))]"
            >
              {JAMES_ENVIRONMENTS.map((environment) => (
                <SelectItem key={environment} value={environment}>
                  {environment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span
            className="min-w-0 max-w-[11rem] truncate rounded bg-muted/60 px-2 py-1 font-mono text-[12px] text-muted-foreground sm:max-w-[20rem]"
            title={WORKSPACE_PATH}
          >
            {WORKSPACE_PATH}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            disabled={isLoadingStatus}
            className="h-7 px-2 text-[12px]"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isLoadingStatus ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearChat}
            disabled={isSending || chatHistory.length === 0}
            className="h-7 px-2 text-[12px]"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear Chat
          </Button>
          {isLoadingStatus ? (
            <span className="text-[12px] text-muted-foreground">
              Checking...
            </span>
          ) : null}
          {statusError || status?.error ? (
            <span
              className="min-w-0 truncate text-[12px] text-destructive"
              title={statusError ?? status?.error ?? undefined}
            >
              {statusError ?? status?.error}
            </span>
          ) : null}
        </div>
      </header>

      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="Orchestrator chat with James"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-muted/20 p-2 [-webkit-overflow-scrolling:touch] sm:p-3">
          <div className="space-y-2">
            <details className="group rounded-full bg-background/80 text-[12px] text-muted-foreground ring-1 ring-border/40 open:rounded-md">
              <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1.5 px-3 py-1 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">
                  Workspace Context: {projectContext.project} · Permission mode: {projectContext.environment} ·{" "}
                  <span className="font-mono">{WORKSPACE_PATH}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t border-border/50 px-3 py-2">
                <div className="grid gap-1 sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Project:</span>{" "}
                    {projectContext.project}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Permission mode:</span>{" "}
                    {projectContext.environment}
                  </div>
                  <div
                    className="min-w-0 truncate font-mono"
                    title={WORKSPACE_PATH}
                  >
                    {WORKSPACE_PATH}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-foreground">
                    Safety rules
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {JAMES_SAFETY_RULES.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>

            <div
              className="flex flex-wrap gap-1.5"
              aria-label="Workspace shortcuts"
            >
              {JAMES_PROJECTS.map((project) => (
                <Button
                  key={project}
                  type="button"
                  variant={
                    projectContext.project === project ? "default" : "outline"
                  }
                  size="sm"
                  className="h-7 rounded-full px-3 text-[12px]"
                  onClick={() => updateProject(project)}
                >
                  {project}
                </Button>
              ))}
            </div>

            <details className="rounded-md bg-background/80 text-[12px] ring-1 ring-border/40">
              <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-2 px-3 py-1 font-medium [&::-webkit-details-marker]:hidden">
                <span>Recent Jobs ({jobs.length})</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="space-y-2 border-t border-border/50 px-3 py-2">
                <p className="text-muted-foreground">
                  In-memory MVP: jobs reset if the API server restarts.
                </p>
                {jobs.length === 0 ? (
                  <p className="text-muted-foreground">
                    No recent background jobs.
                  </p>
                ) : null}
                {jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1"
                  >
                    <span className="min-w-0 truncate font-mono" title={job.id}>
                      {job.id}
                    </span>
                    <span>{job.status}</span>
                    <span>{formatDuration(job.durationMs ?? undefined)}</span>
                    {!isJobFinished(job.status) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[12px]"
                        onClick={() => void cancelJob(job.id)}
                      >
                        <Square className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          </div>

          <div className="mt-2 space-y-2">
            {chatHistory.length === 0 ? (
              <p className="px-1 text-[13px] text-muted-foreground sm:text-sm">
                No messages yet. Send a message to start a chat with James, the current Orchestrator agent.
              </p>
            ) : null}

            {chatHistory.map((chatMessage, index) => {
              const isUser = chatMessage.role === "user";
              const isError = chatMessage.role === "error";
              return (
                <div
                  key={`${chatMessage.timestamp}-${index}`}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-2.5 py-1.5 text-[13px] leading-[1.45] shadow-sm ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : isError
                          ? "bg-destructive/10 text-destructive ring-1 ring-destructive/30"
                          : "bg-zinc-900 text-zinc-100 ring-1 ring-zinc-700/60 dark:bg-zinc-800"
                    }`}
                  >
                    {!isUser ? (
                      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase opacity-75">
                        <JamesAvatar
                          className="h-7 w-7 rounded-full object-cover ring-1 ring-zinc-600/70"
                          fallbackClassName="text-current"
                        />
                        <span>
                          {isError ? "James Error" : jamesIdentity.name} ·{" "}
                          {formatMessageTime(chatMessage.timestamp)}
                        </span>
                      </div>
                    ) : (
                      <div className="mb-0.5 font-mono text-[11px] uppercase opacity-65">
                        You · {formatMessageTime(chatMessage.timestamp)}
                      </div>
                    )}
                    {isUser ? (
                      <div className="whitespace-pre-wrap break-words">
                        {chatMessage.content}
                      </div>
                    ) : (
                      <MarkdownMessage content={chatMessage.content} />
                    )}
                    {chatMessage.execution ? (
                      <ExecutionDetailsBlock details={chatMessage.execution} />
                    ) : null}
                  </div>
                </div>
              );
            })}

            {isSending ? (
              <div className="flex justify-start">
                <div className="flex max-w-[78%] items-center gap-2 rounded-2xl bg-zinc-900 px-2.5 py-1.5 text-[13px] text-zinc-100 ring-1 ring-zinc-700/60">
                  <JamesAvatar
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-zinc-600/70"
                    fallbackClassName="text-current"
                  />
                  <span>
                    {jamesIdentity.name} is thinking
                    <span className="inline-flex w-5 animate-pulse">...</span>
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 z-10 shrink-0 space-y-2 border-t border-border/70 bg-background/95 p-2 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Textarea
            id="james-message"
            ref={messageInputRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleMessageKeyDown}
            placeholder="Ask the Orchestrator (James) what you need done..."
            className="max-h-36 min-h-[4rem] resize-none text-[13px] leading-[1.5]"
            disabled={isSending}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              Enter sends. Shift+Enter adds a new line.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={runBackgroundJob}
                disabled={isSending || !message.trim()}
                size="sm"
                className="h-8"
              >
                Run as Background Job
              </Button>
              <Button
                onClick={sendMessage}
                disabled={isSending || !message.trim()}
                size="sm"
                className="h-8"
              >
                <Send className="mr-2 h-4 w-4" />
                {isSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
