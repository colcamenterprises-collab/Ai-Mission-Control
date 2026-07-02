import { useEffect, useRef, useState } from "react";
import { Bot, RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type ChatMessage = {
  role: "user" | "james" | "error";
  content: string;
  timestamp: string;
};

type AdminTokenSource = "localStorage" | "env" | "fallback";

type AdminToken = {
  source: AdminTokenSource;
  value: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const CHAT_HISTORY_STORAGE_KEY = "mission-control:james-chat-history";
const MVP_FALLBACK_ADMIN_TOKEN = "change-this-later";

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

function createChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString();
}

export default function James() {
  const [status, setStatus] = useState<JamesStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => readChatHistory());
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isSending]);

  const sendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isSending) return;

    const userMessage = createChatMessage("user", trimmedMessage);
    setChatHistory((currentHistory) => [...currentHistory, userMessage]);
    setMessage("");
    setIsSending(true);

    try {
      const result = await readJson<JamesResponse>(
        await fetch("/api/james/message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({ message: trimmedMessage }),
        }),
      );
      setChatHistory((currentHistory) => [...currentHistory, createChatMessage("james", extractJamesResponse(result))]);
    } catch (error) {
      setChatHistory((currentHistory) => [
        ...currentHistory,
        createChatMessage("error", error instanceof Error ? error.message : "Unable to send message to James"),
      ]);
    } finally {
      setIsSending(false);
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
  const isUsingFallbackToken = readAdminToken().source === "fallback";

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-mono font-semibold uppercase tracking-tight">James Console</h1>
          <p className="text-sm text-muted-foreground mt-1">Message James from Mission Control without opening Hermes UI.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={isLoadingStatus}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingStatus ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isUsingFallbackToken ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              James Console is using the temporary MVP fallback admin token. Set MISSION_CONTROL_ADMIN_TOKEN in localStorage or
              VITE_MISSION_CONTROL_ADMIN_TOKEN in the frontend environment to override it.
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" /> James Status
            </CardTitle>
            <CardDescription>Checks /usr/local/bin/james-hermes and its --version command.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant={isOnline ? "default" : "destructive"}>{isOnline ? "Online" : "Offline"}</Badge>
              {isLoadingStatus ? <span className="text-sm text-muted-foreground">Checking status...</span> : null}
            </div>
            {status ? (
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div><dt className="text-muted-foreground">Binary</dt><dd className="font-mono">{status.binaryPath}</dd></div>
                <div><dt className="text-muted-foreground">Version</dt><dd className="font-mono">{status.version ?? "Unavailable"}</dd></div>
                <div><dt className="text-muted-foreground">Exists</dt><dd>{status.exists ? "Yes" : "No"}</dd></div>
                <div><dt className="text-muted-foreground">Version check</dt><dd>{status.versionWorks ? "Passed" : "Failed"}</dd></div>
              </dl>
            ) : null}
            {(statusError || status?.error) ? <p className="text-sm text-destructive">{statusError ?? status?.error}</p> : null}
          </CardContent>
        </Card>

        <Card className="min-h-[32rem]">
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Chat with James</CardTitle>
              <CardDescription>Mission Control prepends the required workspace and production-safety context before execution.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={clearChat} disabled={isSending || chatHistory.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear chat
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-[28rem] flex-col gap-4">
            <div className="flex-1 space-y-4 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
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
                      <div className="whitespace-pre-wrap break-words">{chatMessage.content}</div>
                    </div>
                  </div>
                );
              })}

              {isSending ? (
                <div className="flex justify-start">
                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    James is thinking...
                  </div>
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="space-y-3">
              <Textarea
                id="james-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Ask James what you need done..."
                className="min-h-24 font-mono"
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
