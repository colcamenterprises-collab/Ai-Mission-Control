import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Copy, RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type JamesStatus = {
  binaryPath: string;
  exists: boolean;
  versionWorks: boolean;
  status: "online" | "offline";
  version: string | null;
  error: string | null;
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

const ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const CHAT_HISTORY_STORAGE_KEY = "mission-control:james-chat-history";
const PROJECT_CONTEXT_STORAGE_KEY = "mission-control:james-project-context";
const MVP_FALLBACK_ADMIN_TOKEN = "change-this-later";
const JAMES_PROJECTS: JamesProject[] = ["Mission Control", "SBB App Staging", "Hermes"];
const JAMES_ENVIRONMENTS: JamesEnvironment[] = ["Read Only", "Staging", "Production Locked"];
const DEFAULT_PROJECT_CONTEXT: JamesProjectContext = { project: "Mission Control", environment: "Read Only" };
const JAMES_SAFETY_RULES = [
  "SBB production requires explicit approval",
  "inspect before changing",
  "report files changed and commands run",
];

function isJamesProject(value: unknown): value is JamesProject {
  return typeof value === "string" && JAMES_PROJECTS.includes(value as JamesProject);
}

function isJamesEnvironment(value: unknown): value is JamesEnvironment {
  return typeof value === "string" && JAMES_ENVIRONMENTS.includes(value as JamesEnvironment);
}

function readProjectContext(): JamesProjectContext {
  const storedContext = localStorage.getItem(PROJECT_CONTEXT_STORAGE_KEY);
  if (!storedContext) return DEFAULT_PROJECT_CONTEXT;

  try {
    const parsedContext = JSON.parse(storedContext);
    if (parsedContext === null || typeof parsedContext !== "object") return DEFAULT_PROJECT_CONTEXT;

    return {
      project: isJamesProject(parsedContext.project) ? parsedContext.project : DEFAULT_PROJECT_CONTEXT.project,
      environment: isJamesEnvironment(parsedContext.environment) ? parsedContext.environment : DEFAULT_PROJECT_CONTEXT.environment,
    };
  } catch {
    return DEFAULT_PROJECT_CONTEXT;
  }
}

function createContextMessage(message: string, context: JamesProjectContext): string {
  return [
    "Mission Control workspace context:",
    `Selected project: ${context.project}`,
    `Selected environment: ${context.environment}`,
    "Current safety rules:",
    ...JAMES_SAFETY_RULES.map((rule) => `- ${rule}`),
    "",
    "User message:",
    message,
  ].join("\n");
}

function readAdminToken(): AdminToken {
  const storedToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim();
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof data?.error === "string" ? data.error : `Request failed with ${response.status}`;
    const details = typeof data?.details === "string" ? data.details : "";
    throw new Error(details ? `${error}: ${details}` : error);
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

function createChatMessage(role: ChatMessage["role"], content: string, execution?: ExecutionDetails): ChatMessage {
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
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="underline underline-offset-2" href="$2" target="_blank" rel="noreferrer">$1</a>');
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
    if (match.index > lastIndex) segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    segments.push({ type: "code", language: match[1]?.trim() ?? "", content: match[2] ?? "" });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) segments.push({ type: "text", content: content.slice(lastIndex) });
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
    <div className="space-y-3 break-words leading-relaxed">
      {splitMarkdownSegments(content).map((segment, index) => {
        if (segment.type === "code") {
          return (
            <div key={index} className="overflow-hidden rounded-md border border-border bg-muted/50">
              <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
                <span className="font-mono uppercase">{segment.language || "code"}</span>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void copyCode(segment.content, index)}>
                  {copiedIndex === index ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copiedIndex === index ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="overflow-x-auto p-3 text-xs leading-relaxed"><code>{segment.content}</code></pre>
            </div>
          );
        }

        return (
          <div
            key={index}
            className="whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(segment.content) }}
          />
        );
      })}
    </div>
  );
}

function ExecutionDetailsBlock({ details }: { details: ExecutionDetails }) {
  const summary = details.success ? `Completed in ${formatDuration(details.durationMs)}` : "Failed";

  return (
    <details className="mt-3 rounded-md border border-border bg-muted/20 text-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-muted-foreground">
        <span>{summary}</span>
        <ChevronDown className="h-3 w-3" />
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Exit code</dt><dd className="font-mono">{details.exitCode ?? "Unavailable"}</dd></div>
          <div><dt className="text-muted-foreground">Duration</dt><dd className="font-mono">{formatDuration(details.durationMs)}</dd></div>
          <div><dt className="text-muted-foreground">Timed out</dt><dd>{details.timedOut ? "Yes" : "No"}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd>{details.success ? "Success" : "Failed"}</dd></div>
        </dl>
        {details.error ? <div><div className="text-muted-foreground">Error</div><pre className="whitespace-pre-wrap font-mono">{details.error}</pre></div> : null}
        {details.details ? <div><div className="text-muted-foreground">Details</div><pre className="whitespace-pre-wrap font-mono">{details.details}</pre></div> : null}
        {details.stdout ? <div><div className="text-muted-foreground">stdout</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">{details.stdout}</pre></div> : null}
        {details.stderr ? <div><div className="text-muted-foreground">stderr</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">{details.stderr}</pre></div> : null}
      </div>
    </details>
  );
}

export default function James() {
  const [status, setStatus] = useState<JamesStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => readChatHistory());
  const [projectContext, setProjectContext] = useState<JamesProjectContext>(() => readProjectContext());
  const [isSending, setIsSending] = useState(false);
  const [didLastRequestFail, setDidLastRequestFail] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadStatus = async () => {
    setIsLoadingStatus(true);
    setStatusError(null);
    try {
      const nextStatus = await readJson<JamesStatus>(
        await fetch("/api/james/status", { headers: authHeaders() }),
      );
      setStatus(nextStatus);
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : "Unable to load James status");
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem(PROJECT_CONTEXT_STORAGE_KEY, JSON.stringify(projectContext));
  }, [projectContext]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isSending]);

  const sendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    const messageWithContext = createContextMessage(trimmedMessage, projectContext);
    const userMessage = createChatMessage("user", trimmedMessage);
    setChatHistory((currentHistory) => [...currentHistory, userMessage]);
    setMessage("");
    setIsSending(true);
    setDidLastRequestFail(false);

    try {
      const result = await readJson<JamesResponse>(
        await fetch("/api/james/message", {
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
        createChatMessage(result.success ? "james" : "error", extractJamesResponse(result), createExecutionDetails(result)),
      ]);
    } catch (error) {
      setDidLastRequestFail(true);
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage("error", error instanceof Error ? error.message : "Unable to send message to James"),
      ]);
    } finally {
      setIsSending(false);
      window.setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  const clearChat = () => {
    setChatHistory([]);
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void sendMessage();
  };

  const isOnline = status?.status === "online";
  const jamesState = isSending ? "James Thinking" : didLastRequestFail || statusError ? "Request Failed" : isOnline ? "James Online" : "James Offline";
  const isUsingFallbackToken = readAdminToken().source === "fallback";

  const updateProject = (project: JamesProject) => {
    setProjectContext((currentContext) => ({ ...currentContext, project }));
  };

  const updateEnvironment = (environment: JamesEnvironment) => {
    setProjectContext((currentContext) => ({ ...currentContext, environment }));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">James Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">Message James from Mission Control without opening Hermes UI.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={isLoadingStatus}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingStatus ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      <div className="flex-1 overflow-hidden p-4 space-y-4">
        {isUsingFallbackToken ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              James Console is using the temporary MVP fallback admin token. Set MISSION_CONTROL_ADMIN_TOKEN in localStorage or
              VITE_MISSION_CONTROL_ADMIN_TOKEN in the frontend environment to override it.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,2fr)] md:items-end">
              <div className="space-y-1.5">
                <label htmlFor="james-project-context" className="text-xs font-mono uppercase text-muted-foreground">Project</label>
                <Select value={projectContext.project} onValueChange={(value) => updateProject(value as JamesProject)}>
                  <SelectTrigger id="james-project-context">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {JAMES_PROJECTS.map((project) => (
                      <SelectItem key={project} value={project}>{project}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="james-environment-context" className="text-xs font-mono uppercase text-muted-foreground">Environment</label>
                <Select value={projectContext.environment} onValueChange={(value) => updateEnvironment(value as JamesEnvironment)}>
                  <SelectTrigger id="james-environment-context">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {JAMES_ENVIRONMENTS.map((environment) => (
                      <SelectItem key={environment} value={environment}>{environment}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                <div className="font-mono text-xs uppercase text-muted-foreground">Selected context</div>
                <div className="mt-1 font-medium">{projectContext.project} · {projectContext.environment}</div>
                <div className="mt-1 text-xs text-muted-foreground">Safety rules are prepended automatically when you send.</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <Badge variant={isOnline && !statusError && !didLastRequestFail ? "default" : "destructive"}>{jamesState}</Badge>
                {isLoadingStatus ? <span className="text-sm text-muted-foreground">Checking status...</span> : null}
                {status?.version ? <span className="font-mono text-xs text-muted-foreground">{status.version}</span> : null}
              </div>
              {status ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Status details</summary>
                  <dl className="mt-2 grid gap-2 md:grid-cols-2">
                    <div><dt className="text-muted-foreground">Binary</dt><dd className="font-mono">{status.binaryPath}</dd></div>
                    <div><dt className="text-muted-foreground">Version</dt><dd className="font-mono">{status.version ?? "Unavailable"}</dd></div>
                    <div><dt className="text-muted-foreground">Exists</dt><dd>{status.exists ? "Yes" : "No"}</dd></div>
                    <div><dt className="text-muted-foreground">Version check</dt><dd>{status.versionWorks ? "Passed" : "Failed"}</dd></div>
                  </dl>
                </details>
              ) : null}
              {(statusError || status?.error) ? <p className="text-sm text-destructive">{statusError ?? status?.error}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-[calc(100vh-13rem)] min-h-[34rem] flex-col">
          <CardHeader className="shrink-0 gap-3 py-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Chat with James</CardTitle>
              <CardDescription>Mission Control prepends the required workspace and production-safety context before execution.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={clearChat} disabled={isSending || chatHistory.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear chat
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pb-4">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
              {chatHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet. Send a message to start a chat with James.</p>
              ) : null}

              {chatHistory.map((chatMessage, index) => {
                const isUser = chatMessage.role === "user";
                const isError = chatMessage.role === "error";
                return (
                  <div key={`${chatMessage.timestamp}-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-lg border px-4 py-3 text-sm ${
                        isUser
                          ? "border-primary bg-primary text-primary-foreground"
                          : isError
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-border bg-background"
                      }`}
                    >
                      <div className="mb-1 font-mono text-[0.7rem] uppercase opacity-75">
                        {isUser ? "You" : isError ? "Error" : "James"} · {formatMessageTime(chatMessage.timestamp)}
                      </div>
                      {isUser ? <div className="whitespace-pre-wrap break-words">{chatMessage.content}</div> : <MarkdownMessage content={chatMessage.content} />}
                      {chatMessage.execution ? <ExecutionDetailsBlock details={chatMessage.execution} /> : null}
                    </div>
                  </div>
                );
              })}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    James Thinking
                  </div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="space-y-3">
              <Textarea
                id="james-message"
                ref={messageInputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Ask James what you need done..."
                className="min-h-20 resize-none"
                disabled={isSending}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Enter sends. Shift+Enter adds a new line.</p>
                <Button onClick={sendMessage} disabled={isSending || !message.trim()}>
                  <Send className="w-4 h-4 mr-2" />
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
