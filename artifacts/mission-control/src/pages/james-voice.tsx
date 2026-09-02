import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JamesAvatar } from "@/components/james-avatar";

type Message = { id: string; role: "user" | "james" | "system"; content: string };
type VoiceState = "connecting" | "ready" | "listening" | "transcribing" | "thinking" | "speaking" | "credit-limit" | "error";
type NativeVoiceConfig = {
  available: boolean;
  mode: "hermes-native";
  proxyBasePath: string;
  sessionToken: string;
  stt: "hermes";
  tts: "hermes";
  conversation: "tui-gateway-json-rpc";
  browserSpeechRecognition: false;
  browserSpeechSynthesis: false;
};
type RpcFrame = {
  id?: string | number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
  type?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};
type PendingRpc = { resolve(value: unknown): void; reject(error: Error): void; timeout: number };

type AudioSpeakResponse = { ok: boolean; data_url: string; mime_type: string };
type AudioTranscriptionResponse = { ok?: boolean; transcript?: string; text?: string; error?: string };

const TOKEN_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_KEY = "MISSION_CONTROL_ADMIN_TOKEN";
const SESSION_KEY = "mission_control_james_hermes_session_v1";
const MAX_RECORDING_MS = 30_000;
const SILENCE_AFTER_SPEECH_MS = 1_050;
const SPEECH_RMS_THRESHOLD = 0.022;

function adminToken() {
  return localStorage.getItem(TOKEN_KEY)?.trim() || localStorage.getItem(LEGACY_TOKEN_KEY)?.trim() || import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim() || "change-this-later";
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

function sentenceCut(buffer: string, flush = false): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  while (true) {
    const match = rest.match(/^([\s\S]*?[.!?])(?:\s+|$)/);
    if (!match) break;
    const sentence = match[1].trim();
    if (sentence) sentences.push(sentence);
    rest = rest.slice(match[0].length);
  }
  if (flush && rest.trim()) {
    sentences.push(rest.trim());
    rest = "";
  }
  return { sentences, rest };
}

export default function JamesVoice() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<VoiceState>("connecting");
  const [voiceMode, setVoiceMode] = useState(false);
  const [statusText, setStatusText] = useState("Connecting to James…");

  const configRef = useRef<NativeVoiceConfig | null>(null);
  const gatewayRef = useRef<WebSocket | null>(null);
  const pendingRpc = useRef(new Map<string | number, PendingRpc>());
  const rpcCounter = useRef(0);
  const sessionId = useRef<string | null>(null);
  const activeAssistantId = useRef<string | null>(null);
  const assistantText = useRef("");
  const sentenceBuffer = useRef("");
  const speechQueue = useRef<string[]>([]);
  const speaking = useRef(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const generationActive = useRef(false);
  const voiceModeRef = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderChunks = useRef<Blob[]>([]);
  const microphoneStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const vadFrame = useRef<number | null>(null);
  const discardRecording = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, statusText]);

  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown voice error");
    if (isCreditFailure(message)) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      setState("credit-limit");
      setStatusText("James's model provider returned HTTP 402 / insufficient credits. Voice transport has stopped and will not retry.");
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

  async function interruptJames() {
    currentAudio.current?.pause();
    currentAudio.current = null;
    speechQueue.current = [];
    sentenceBuffer.current = "";
    speaking.current = false;
    if (sessionId.current && generationActive.current) {
      try { await rpc("session.interrupt", { session_id: sessionId.current }, 10_000); } catch { /* interruption is best effort */ }
    }
    generationActive.current = false;
  }

  async function playNativeSpeech(text: string) {
    const config = configRef.current;
    if (!config || !text.trim()) return;
    const response = await fetch(`${config.proxyBasePath}/api/audio/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hermes-Session-Token": config.sessionToken },
      body: JSON.stringify({ text: text.trim() }),
    });
    const raw = await response.text();
    if (response.status === 402 || isCreditFailure(raw)) throw new Error(`HTTP ${response.status}: ${raw}`);
    if (!response.ok) throw new Error(`Hermes TTS failed (${response.status}): ${raw}`);
    const payload = JSON.parse(raw) as AudioSpeakResponse;
    if (!payload.ok || !payload.data_url) throw new Error("Hermes TTS returned no audio");
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(payload.data_url);
      currentAudio.current = audio;
      audio.onended = () => { currentAudio.current = null; resolve(); };
      audio.onerror = () => { currentAudio.current = null; reject(new Error("Hermes audio playback failed")); };
      void audio.play().catch(reject);
    });
  }

  async function pumpSpeech() {
    if (speaking.current) return;
    speaking.current = true;
    try {
      while (speechQueue.current.length) {
        setState("speaking");
        setStatusText("James is speaking — tap the microphone to interrupt.");
        const sentence = speechQueue.current.shift()!;
        await playNativeSpeech(sentence);
      }
    } catch (error) {
      fail(error);
      return;
    } finally {
      speaking.current = false;
    }
    if (!generationActive.current && voiceModeRef.current) {
      window.setTimeout(() => void beginListening(), 250);
    } else if (!generationActive.current) {
      setState("ready");
      setStatusText("James is ready.");
    }
  }

  function queueSpeechDelta(delta: string, flush = false) {
    sentenceBuffer.current += delta;
    const cut = sentenceCut(sentenceBuffer.current, flush);
    sentenceBuffer.current = cut.rest;
    if (cut.sentences.length) {
      speechQueue.current.push(...cut.sentences);
      void pumpSpeech();
    }
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
    if (!assistantText.current && finalText) updateAssistant(finalText);
    generationActive.current = false;
    queueSpeechDelta("", true);
    activeAssistantId.current = null;
    assistantText.current = "";
    if (!speaking.current && speechQueue.current.length === 0) {
      if (voiceModeRef.current) window.setTimeout(() => void beginListening(), 250);
      else { setState("ready"); setStatusText("James is ready."); }
    }
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
      queueSpeechDelta(delta);
    } else if (frame.type === "message.complete") {
      finishAssistant(frame.payload);
    } else if (frame.type === "error") {
      fail(frame.payload?.message ?? frame.payload?.error ?? "Hermes conversation error");
    }
  }

  async function connectHermes() {
    setState("connecting");
    setStatusText("Connecting Mission Control to James's Hermes voice runtime…");
    const configResponse = await fetch("/api/james/native-voice/config", { headers: { Authorization: `Bearer ${adminToken()}` } });
    const configText = await configResponse.text();
    if (!configResponse.ok) throw new Error(`Hermes native voice bridge unavailable (${configResponse.status}): ${configText}`);
    const config = JSON.parse(configText) as NativeVoiceConfig;
    if (!config.available) throw new Error("Hermes native voice bridge is not available");
    configRef.current = config;

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${scheme}//${window.location.host}${config.proxyBasePath}/api/ws?token=${encodeURIComponent(config.sessionToken)}`);
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
    if (!clean || !sessionId.current) return;
    await interruptJames();
    setMessages((items) => [...items, { id: uid("user"), role: "user", content: clean }]);
    setDraft("");
    activeAssistantId.current = null;
    assistantText.current = "";
    sentenceBuffer.current = "";
    generationActive.current = true;
    setState("thinking");
    setStatusText("James is thinking…");
    try {
      await rpc("prompt.submit", { session_id: sessionId.current, text: clean }, 1_800_000);
    } catch (error) {
      generationActive.current = false;
      fail(error);
    }
  }

  function cleanupRecorder() {
    if (vadFrame.current !== null) cancelAnimationFrame(vadFrame.current);
    vadFrame.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    void audioContext.current?.close().catch(() => undefined);
    audioContext.current = null;
    analyser.current = null;
    recorder.current = null;
  }

  async function transcribeRecording(blob: Blob) {
    const config = configRef.current;
    if (!config) return;
    setState("transcribing");
    setStatusText("Hermes is transcribing your voice locally…");
    const dataUrl = await blobToDataUrl(blob);
    const response = await fetch(`${config.proxyBasePath}/api/audio/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hermes-Session-Token": config.sessionToken },
      body: JSON.stringify({ data_url: dataUrl, mime_type: blob.type || "audio/webm" }),
    });
    const raw = await response.text();
    if (response.status === 402 || isCreditFailure(raw)) throw new Error(`HTTP ${response.status}: ${raw}`);
    if (!response.ok) throw new Error(`Hermes transcription failed (${response.status}): ${raw}`);
    const payload = JSON.parse(raw) as AudioTranscriptionResponse;
    const transcript = String(payload.transcript ?? payload.text ?? "").trim();
    if (!transcript) {
      if (voiceModeRef.current) window.setTimeout(() => void beginListening(), 200);
      return;
    }
    await submitPrompt(transcript);
  }

  async function beginListening() {
    if (!voiceModeRef.current || recorder.current || state === "credit-limit") return;
    await interruptJames();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
      audioContext.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      analyser.current = node;
      const samples = new Uint8Array(node.fftSize);
      const startedAt = performance.now();
      let speechSeen = false;
      let lastSpeechAt = startedAt;
      const watch = () => {
        if (!recorder.current || recorder.current.state !== "recording") return;
        node.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) { const n = (sample - 128) / 128; sum += n * n; }
        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (rms >= SPEECH_RMS_THRESHOLD) { speechSeen = true; lastSpeechAt = now; }
        if ((speechSeen && now - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS) || now - startedAt >= MAX_RECORDING_MS) {
          recorder.current.stop();
          return;
        }
        vadFrame.current = requestAnimationFrame(watch);
      };
      mediaRecorder.start(250);
      setState("listening");
      setStatusText("Listening… speak naturally. James will respond when you finish.");
      vadFrame.current = requestAnimationFrame(watch);
    } catch (error) {
      cleanupRecorder();
      fail(error);
    }
  }

  async function startVoiceConversation() {
    if (state === "credit-limit") return;
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
      currentAudio.current?.pause();
      gatewayRef.current?.close();
      pendingRpc.current.forEach((entry) => { window.clearTimeout(entry.timeout); entry.reject(new Error("James voice page closed")); });
      pendingRpc.current.clear();
    };
  }, []);

  const canTalk = !["connecting", "error", "credit-limit"].includes(state);

  return <div className="flex h-full flex-col overflow-hidden">
    <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
      <div className="flex items-center gap-3"><JamesAvatar className="h-10 w-10" /><div><h1 className="font-semibold">Talk to James</h1><p className="text-xs text-muted-foreground">Hermes native conversation · persistent James session</p></div></div>
      {voiceMode && <Button variant="outline" size="sm" onClick={() => void stopVoiceConversation()}><Square className="mr-2 h-4 w-4" />Stop voice</Button>}
    </header>

    <div className="border-b border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">{statusText}</div>

    <div className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto flex max-w-3xl flex-col gap-3">
      {messages.length === 0 && <div className="rounded-2xl border border-border bg-card p-5"><strong>This is James's Hermes voice runtime.</strong><p className="mt-1 text-sm text-muted-foreground">Mission Control captures your microphone only. Hermes handles transcription, the persistent conversation, James's reasoning, interruption and voice output. Browser speech recognition and browser text-to-speech are not used.</p></div>}
      {messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : message.role === "james" ? "mr-auto border border-border bg-card" : "mx-auto bg-muted text-muted-foreground"}`}>{message.content}</div>)}
      <div ref={bottom} />
    </div></div>

    <div className="border-t border-border bg-background/90 p-3 backdrop-blur md:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2">
      <Button type="button" size="icon" variant={voiceMode ? "default" : "secondary"} onClick={() => void bargeIn()} disabled={!canTalk} aria-label={voiceMode ? "Interrupt James and speak" : "Start voice conversation"}>{state === "listening" ? <MicOff /> : <Mic />}</Button>
      <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitPrompt(draft); } }} placeholder="Talk naturally, or type to James…" className="min-h-[48px] max-h-32 resize-none" />
      <Button type="button" size="icon" onClick={() => void submitPrompt(draft)} disabled={!draft.trim() || !canTalk} aria-label="Send to James"><Send /></Button>
    </div><p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">Voice mode re-arms after each reply. Tap the microphone while James is speaking to interrupt him. HTTP 402/credit errors stop the loop instead of retrying.</p></div>
  </div>;
}
