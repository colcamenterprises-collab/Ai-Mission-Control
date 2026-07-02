import { useEffect, useState } from "react";
import { Bot, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut?: boolean;
  error?: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("mission_control_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export default function James() {
  const [status, setStatus] = useState<JamesStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<JamesResponse | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

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

  const sendMessage = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    setIsSending(true);
    setSendError(null);
    setResponse(null);
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
      setResponse(result);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send message to James");
    } finally {
      setIsSending(false);
    }
  };

  const isOnline = status?.status === "online";

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

        <Card>
          <CardHeader>
            <CardTitle>Message James</CardTitle>
            <CardDescription>Mission Control prepends the required workspace and production-safety context before execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="james-message">Message</Label>
              <Textarea
                id="james-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ask James what you need done..."
                className="min-h-32 font-mono"
                disabled={isSending}
              />
            </div>
            <Button onClick={sendMessage} disabled={isSending || !message.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {isSending ? "Sending..." : "Send to James"}
            </Button>
            {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>Returns stdout, stderr, exit code, and duration from james-hermes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSending ? <p className="text-sm text-muted-foreground">Waiting for James. This can take up to 180 seconds.</p> : null}
            {response ? (
              <div className="space-y-4">
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <div><span className="text-muted-foreground">Exit code:</span> {response.exitCode ?? "None"}</div>
                  <div><span className="text-muted-foreground">Duration:</span> {response.durationMs}ms</div>
                  <div><span className="text-muted-foreground">Timed out:</span> {response.timedOut ? "Yes" : "No"}</div>
                </div>
                <div>
                  <h2 className="font-mono text-xs uppercase text-muted-foreground mb-2">Stdout</h2>
                  <pre className="rounded-md border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm overflow-x-auto">{response.stdout || "No stdout"}</pre>
                </div>
                <div>
                  <h2 className="font-mono text-xs uppercase text-muted-foreground mb-2">Stderr</h2>
                  <pre className="rounded-md border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm overflow-x-auto">{response.stderr || "No stderr"}</pre>
                </div>
              </div>
            ) : !isSending ? <p className="text-sm text-muted-foreground">No response yet.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
