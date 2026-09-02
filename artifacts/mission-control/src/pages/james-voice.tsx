import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JamesAvatar } from "@/components/james-avatar";

type Message = { id: string; role: "user" | "james" | "system"; content: string };
type VoiceState = "connecting" | "ready" | "listening" | "transcribing" | "thinking" | "speaking" | "credit-limit" | "error";
type RpcFrame = {
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
  type?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};
type PendingRpc = { resolve(value: unknown): void; reject(error: Error): void; timeout: number };
type AudioTranscriptionResponse = { ok?: boolean; transcript?: string; text?: string; error?: string };
type WsTicketResponse = { ticket?: string; ttl_seconds?: number };
type SpeechStream = {
  append(text: string): void;
  finish(): void;
  stop(): void;
  done: Promise<void>;
};

const ADMIN_TOKEN_STORAGE_KEY = "mission_control_admin_token";
const LEGACY_ADMIN_TOKEN_STORAGE_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const SESSION_KEY = "mission_control_james_hermes_session_v1";
const HERMES_PROXY_BASE_PATH = "/hermes-james";
const MAX_RECORDING_MS = 30_000;
const SILENCE_AFTER_SPEECH_MS = 1_050;
const SPEECH_RMS_THRESHOLD = 0.022;

function adminToken() {
  return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim()
    || localStorage.getItem(LEGACY_ADMIN_TOKEN_STORAGE_KEY)?.trim()
    || import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim()
    || "change-this-later";
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCreditFailure(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return /\b402\b|payment required|credit limit|insufficient[_ -]?(quota|credit|balance)|out of credits|no balance/.test(text);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read recorded audio"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

async function voiceBridge<T>(voiceAction: "status" | "transcribe" | "ws-ticket", payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/james/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify({ voiceAction, ...payload }),
  });
  const raw = await response.text();
  if (response.status === 402 || isCreditFailure(raw)) {
    throw new Error(`HTTP ${response.status}: ${raw}`);
  }
  if (!response.ok) {
    throw new Error(`Hermes ${voiceAction} failed (${response.status}): ${raw}`);
  }
  try {
    return JSON.parse(raw || "{}") as T;
  } catch {
    throw new Error(`Hermes ${voiceAction} returned invalid JSON`);
  }
}

export default function JamesVoice() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<VoiceState>("connecting");
  const [voiceMode, setVoiceMode] = useState(false);
  const [statusText, setStatusText] = useState("Connecting to James…");

  const gatewayRef = useRef<WebSocket | null>(null);
  const pendingRpc = useRef(new Map<string | number, PendingRpc>());
  const rpcCounter = useRef(0);
  const sessionId = useRef<string | null>(null);
  const activeAssistantId = useRef<string | null>(null);
  const assistantText = useRef("");
  const generationActive = useRef(false);
  const voiceModeRef = useRef(false);
  const creditBlocked = useRef(false);
  const activeSpeechStream = useRef<SpeechStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderChunks = useRef<Blob[]>([]);
  const microphoneStream = useRef<MediaStream | null>(null);
  const vadContext = useRef<AudioContext | null>(null);
  const vadFrame = useRef<number | null>(null);
  const discardRecording = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, statusText]);

  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown voice error");
    if (isCreditFailure(message)) {
      creditBlocked.current = true;
      voiceModeRef.current = false;
      setVoiceMode(false);
      setState("credit-limit");
      setStatusText("James's model provider returned HTTP 402 / insufficient credits. Voice conversation stopped and will not retry.");
      return;
    }
    setState("error");
    setStatusText(message);
  }

  function rpc(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<unknown> {
    const ws = gatewayRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Hermes conversation gateway is not connected"));
    const id = `mc-${++rpcCounter.current}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingRpc.current.delete(id);
        reject(new Error(`Hermes RPC ${method} timed out`));
      }, timeoutMs);
      pendingRpc.current.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  function stopSpeechStream() {
    activeSpeechStream.current?.stop();
    activeSpeechStream.current = null;
  }

  async function interruptJames() {
    stopSpeechStream();
    if (sessionId.current && generationActive.current) {
      try { await rpc("session.interrupt", { session_id: sessionId.current }, 10_000); } catch { /* best effort */ }
    }
    generationActive.current = false;
  }

  async function mintWsTicket(): Promise<string> {
    const result = await voiceBridge<WsTicketResponse>("ws-ticket");
    const ticket = result.ticket?.trim();
    if (!ticket) throw new Error("Hermes did not return a WebSocket ticket");
    return ticket;
  }

  async function openSpeechStream(): Promise<SpeechStream> {
    const ticket = await mintWsTicket();
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${scheme}//${window.location.host}${HERMES_PROXY_BASE_PATH}/api/audio/speak-stream?ticket=${encodeURIComponent(ticket)}`);
    ws.binaryType = "arraybuffer";

    let context: AudioContext | null = null;
    let streamRate = 24_000;
    let nextStartAt = 0;
    let carry: Uint8Array | null = null;
    let opened = false;
    let finished = false;
    let settled = false;
    const pendingSends: string[] = [];
    const scheduledSources = new Set<AudioBufferSourceNode>();

    let resolveDone: () => void = () => undefined;
    let rejectDone: (error: Error) => void = () => undefined;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* already closed */ }
      for (const source of scheduledSources) {
        try { source.stop(); } catch { /* already stopped */ }
      }
      scheduledSources.clear();
      void context?.close().catch(() => undefined);
      context = null;
      if (error) rejectDone(error); else resolveDone();
    };

    const send = (frame: object) => {
      const encoded = JSON.stringify(frame);
      if (ws.readyState === WebSocket.OPEN) ws.send(encoded);
      else if (ws.readyState === WebSocket.CONNECTING) pendingSends.push(encoded);
    };

    const finishWhenDrained = () => {
      const remainingMs = context ? Math.max(0, nextStartAt - context.currentTime) * 1_000 : 0;
      window.setTimeout(() => settle(), remainingMs + 120);
    };

    const schedulePcm = (data: ArrayBuffer) => {
      if (!context) return;
      let bytes = new Uint8Array(data);
      if (carry) {
        const joined = new Uint8Array(carry.length + bytes.length);
        joined.set(carry);
        joined.set(bytes, carry.length);
        bytes = joined;
        carry = null;
      }
      const usable = bytes.length - (bytes.length % 2);
      if (bytes.length !== usable) carry = bytes.slice(usable);
      if (!usable) return;

      const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2);
      const buffer = context.createBuffer(1, pcm.length, streamRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32_768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const startAt = Math.max(context.currentTime + 0.04, nextStartAt);
      source.start(startAt);
      nextStartAt = startAt + buffer.duration;
      scheduledSources.add(source);
      source.onended = () => scheduledSources.delete(source);
      setState("speaking");
      setStatusText("James is speaking — tap the microphone to interrupt.");
    };

    ws.onopen = () => {
      opened = true;
      pendingSends.splice(0).forEach((item) => ws.send(item));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        schedulePcm(event.data as ArrayBuffer);
        return;
      }
      let frame: { type?: string; sample_rate?: number; message?: string; error?: string };
      try { frame = JSON.parse(event.data) as typeof frame; } catch { return; }
      if (frame.type === "start") {
        streamRate = frame.sample_rate || 24_000;
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) {
          settle(new Error("This browser cannot play Hermes streaming audio"));
          return;
        }
        context = new Ctx();
        if (context.state === "suspended") void context.resume().catch(() => undefined);
        nextStartAt = 0;
      } else if (frame.type === "end") {
        finishWhenDrained();
      } else if (frame.type === "fallback") {
        settle(new Error("Hermes streaming TTS provider returned fallback"));
      } else if (frame.type === "error") {
        settle(new Error(frame.message || frame.error || "Hermes streaming TTS failed"));
      }
    };
    ws.onerror = () => {
      if (!settled) settle(new Error("Hermes streaming TTS WebSocket failed"));
    };
    ws.onclose = () => {
      if (!settled && opened && finished) finishWhenDrained();
      else if (!settled) settle(new Error("Hermes streaming TTS disconnected"));
    };

    return {
      append(text: string) {
        if (text && !finished && !settled) send({ text });
      },
      finish() {
        if (!finished && !settled) {
          finished = true;
          send({ done: true });
        }
      },
      stop() { settle(); },
      done,
    };
  }

  function updateAssistant(delta: string) {
    if (!delta) return;
    assistantText.current += delta;
    let id = activeAssistantId.current;
    if (!id) {
      id = uid("james");
      activeAssistantId.current = id;
      setMessages((items) => [...items, { id: id!, role: "james", content: delta }]);
      return;
    }
    setMessages((items) => items.map((item) => item.id === id ? { ...item, content: assistantText.current } : item));
  }

  function finishAssistant(payload?: Record<string, unknown>) {
    const finalText = typeof payload?.text === "string" ? payload.text : "";
    if (!assistantText.current && finalText) {
      updateAssistant(finalText);
      activeSpeechStream.current?.append(finalText);
    }
    generationActive.current = false;
    activeAssistantId.current = null;
    assistantText.current = "";

    const speech = activeSpeechStream.current;
    if (speech) {
      speech.finish();
      void speech.done.then(() => {
        if (activeSpeechStream.current === speech) activeSpeechStream.current = null;
        if (voiceModeRef.current && !creditBlocked.current) window.setTimeout(() => void beginListening(), 220);
        else { setState("ready"); setStatusText("James is ready."); }
      }).catch(fail);
      return;
    }

    if (voiceModeRef.current && !creditBlocked.current) window.setTimeout(() => void beginListening(), 220);
    else { setState("ready"); setStatusText("James is ready."); }
  }

  function handleGatewayFrame(event: MessageEvent<string>) {
    let frame: RpcFrame;
    try { frame = JSON.parse(event.data) as RpcFrame; } catch { return; }
    if (frame.id !== undefined) {
      const pending = pendingRpc.current.get(frame.id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      pendingRpc.current.delete(frame.id);
      if (frame.error) pending.reject(new Error(`${frame.error.code ?? "RPC"}: ${frame.error.message ?? "Hermes RPC failed"} ${JSON.stringify(frame.error.data ?? "")}`));
      else pending.resolve(frame.result);
      return;
    }
    if (frame.session_id && sessionId.current && frame.session_id !== sessionId.current) return;
    if (frame.type === "message.delta") {
      const delta = typeof frame.payload?.text === "string" ? frame.payload.text : "";
      updateAssistant(delta);
      activeSpeechStream.current?.append(delta);
    } else if (frame.type === "message.complete") {
      finishAssistant(frame.payload);
    } else if (frame.type === "error") {
      fail(frame.payload?.message ?? frame.payload?.error ?? "Hermes conversation error");
    }
  }

  async function connectHermes() {
    setState("connecting");
    setStatusText("Connecting Mission Control to James's Hermes runtime…");
    await voiceBridge("status");
    const ticket = await mintWsTicket();
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${scheme}//${window.location.host}${HERMES_PROXY_BASE_PATH}/api/ws?ticket=${encodeURIComponent(ticket)}`);
    gatewayRef.current = ws;
    ws.onmessage = handleGatewayFrame;
    ws.onclose = () => {
      if (gatewayRef.current === ws) {
        setState("error");
        setStatusText("The Hermes conversation gateway disconnected.");
      }
    };
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Timed out connecting to Hermes conversation gateway")), 15_000);
      ws.onopen = () => { window.clearTimeout(timer); resolve(); };
      ws.onerror = () => { window.clearTimeout(timer); reject(new Error("Unable to open Hermes conversation gateway")); };
    });

    const savedSession = localStorage.getItem(SESSION_KEY)?.trim();
    if (savedSession) {
      try {
        await rpc("session.resume", { session_id: savedSession }, 20_000);
        sessionId.current = savedSession;
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    if (!sessionId.current) {
      const created = await rpc("session.create", {}, 20_000) as { session_id?: string };
      if (!created?.session_id) throw new Error("Hermes did not return a conversation session id");
      sessionId.current = created.session_id;
      localStorage.setItem(SESSION_KEY, created.session_id);
    }
    setState("ready");
    setStatusText("James is ready. Start voice conversation to talk naturally.");
  }

  async function submitPrompt(text: string) {
    const clean = text.trim();
    if (!clean || !sessionId.current || creditBlocked.current) return;
    await interruptJames();
    setMessages((items) => [...items, { id: uid("user"), role: "user", content: clean }]);
    setDraft("");
    activeAssistantId.current = null;
    assistantText.current = "";
    generationActive.current = true;
    setState("thinking");
    setStatusText("James is thinking…");

    try {
      if (voiceModeRef.current) activeSpeechStream.current = await openSpeechStream();
      await rpc("prompt.submit", { session_id: sessionId.current, text: clean }, 1_800_000);
    } catch (error) {
      generationActive.current = false;
      stopSpeechStream();
      fail(error);
    }
  }

  function cleanupRecorder() {
    if (vadFrame.current !== null) cancelAnimationFrame(vadFrame.current);
    vadFrame.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    void vadContext.current?.close().catch(() => undefined);
    vadContext.current = null;
    recorder.current = null;
  }

  async function transcribeRecording(blob: Blob) {
    setState("transcribing");
    setStatusText("Hermes is transcribing your voice locally…");
    const dataUrl = await blobToDataUrl(blob);
    const payload = await voiceBridge<AudioTranscriptionResponse>("transcribe", {
      data_url: dataUrl,
      mime_type: blob.type || "audio/webm",
    });
    const transcript = String(payload.transcript ?? payload.text ?? "").trim();
    if (!transcript) {
      if (voiceModeRef.current && !creditBlocked.current) window.setTimeout(() => void beginListening(), 200);
      return;
    }
    await submitPrompt(transcript);
  }

  async function beginListening() {
    if (!voiceModeRef.current || recorder.current || creditBlocked.current) return;
    await interruptJames();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      microphoneStream.current = stream;
      recorderChunks.current = [];
      discardRecording.current = false;
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) recorderChunks.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const discard = discardRecording.current;
        const chunks = [...recorderChunks.current];
        const mime = mediaRecorder.mimeType || "audio/webm";
        cleanupRecorder();
        if (!discard && chunks.length) void transcribeRecording(new Blob(chunks, { type: mime })).catch(fail);
      };

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("This browser cannot analyse microphone audio for turn detection");
      const ctx = new Ctx();
      vadContext.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const startedAt = performance.now();
      let speechSeen = false;
      let lastSpeechAt = startedAt;

      const watch = () => {
        if (!recorder.current || recorder.current.state !== "recording") return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (rms >= SPEECH_RMS_THRESHOLD) {
          speechSeen = true;
          lastSpeechAt = now;
        }
        if ((speechSeen && now - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS) || now - startedAt >= MAX_RECORDING_MS) {
          recorder.current.stop();
          return;
        }
        vadFrame.current = requestAnimationFrame(watch);
      };

      mediaRecorder.start(250);
      setState("listening");
      setStatusText("Listening… speak naturally. James will answer when you finish.");
      vadFrame.current = requestAnimationFrame(watch);
    } catch (error) {
      cleanupRecorder();
      fail(error);
    }
  }

  async function startVoiceConversation() {
    if (creditBlocked.current) return;
    voiceModeRef.current = true;
    setVoiceMode(true);
    await beginListening();
  }

  async function stopVoiceConversation() {
    voiceModeRef.current = false;
    setVoiceMode(false);
    discardRecording.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    await interruptJames();
    setState("ready");
    setStatusText("Voice conversation stopped. James is ready.");
  }

  async function bargeIn() {
    if (!voiceModeRef.current) {
      await startVoiceConversation();
      return;
    }
    await interruptJames();
    if (!recorder.current) await beginListening();
  }

  useEffect(() => {
    void connectHermes().catch(fail);
    return () => {
      voiceModeRef.current = false;
      discardRecording.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanupRecorder();
      stopSpeechStream();
      gatewayRef.current?.close();
      pendingRpc.current.forEach((entry) => {
        window.clearTimeout(entry.timeout);
        entry.reject(new Error("James voice page closed"));
      });
      pendingRpc.current.clear();
    };
  }, []);

  const canTalk = !["connecting", "error", "credit-limit"].includes(state);

  return <div className="flex h-full flex-col overflow-hidden">
    <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        <JamesAvatar className="h-10 w-10" />
        <div><h1 className="font-semibold">Talk to James</h1><p className="text-xs text-muted-foreground">Hermes native conversation · persistent James session</p></div>
      </div>
      {voiceMode && <Button variant="outline" size="sm" onClick={() => void stopVoiceConversation()}><Square className="mr-2 h-4 w-4" />Stop voice</Button>}
    </header>

    <div className="border-b border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">{statusText}</div>

    <div className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto flex max-w-3xl flex-col gap-3">
      {messages.length === 0 && <div className="rounded-2xl border border-border bg-card p-5"><strong>This is James's Hermes conversation runtime.</strong><p className="mt-1 text-sm text-muted-foreground">The tablet only captures microphone audio and detects when your turn ends. Hermes performs transcription, keeps the persistent conversation, streams James's response and streams his voice. Browser speech recognition and browser text-to-speech are not used.</p></div>}
      {messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : message.role === "james" ? "mr-auto border border-border bg-card" : "mx-auto bg-muted text-muted-foreground"}`}>{message.content}</div>)}
      <div ref={bottom} />
    </div></div>

    <div className="border-t border-border bg-background/90 p-3 backdrop-blur md:p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Button type="button" size="icon" variant={voiceMode ? "default" : "secondary"} onClick={() => void bargeIn()} disabled={!canTalk} aria-label={voiceMode ? "Interrupt James and speak" : "Start voice conversation"}>{state === "listening" ? <MicOff /> : <Mic />}</Button>
        <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitPrompt(draft); } }} placeholder="Talk naturally, or type to James…" className="min-h-[48px] max-h-32 resize-none" />
        <Button type="button" size="icon" onClick={() => void submitPrompt(draft)} disabled={!draft.trim() || !canTalk} aria-label="Send to James"><Send /></Button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">Voice mode re-arms after each reply. Tap the microphone while James is speaking to barge in. HTTP 402/credit errors stop the loop instead of retrying.</p>
    </div>
  </div>;
}
