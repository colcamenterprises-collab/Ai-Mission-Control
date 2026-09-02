import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JamesAvatar } from "@/components/james-avatar";

type Message = { role: "user" | "james"; content: string; at: string };
type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: SpeechRecognitionEventLike) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global { interface Window { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor } }

const HISTORY_KEY = "mission_control_james_voice_history_v1";
const TOKEN_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_KEY = "MISSION_CONTROL_ADMIN_TOKEN";

function loadHistory(): Message[] { try { const x = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(x) ? x.slice(-30) : []; } catch { return []; } }
function token() { return localStorage.getItem(TOKEN_KEY)?.trim() || localStorage.getItem(LEGACY_TOKEN_KEY)?.trim() || import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim() || "change-this-later"; }
function speak(text: string) { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, "")); utterance.rate = 1; utterance.pitch = 1; window.speechSynthesis.speak(utterance); }

export default function JamesVoice() {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceSupported] = useState(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30))); bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { recognition.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  function toggleListen() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor(); recognition.current = r; r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-AU";
    r.onresult = (event) => { let finalText = ""; let interim = ""; for (let i = 0; i < event.results.length; i++) { const result = event.results[i]; if (result.isFinal) finalText += result[0].transcript; else interim += result[0].transcript; } setDraft((previous) => finalText ? `${previous} ${finalText}`.trim() : interim); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false); r.start(); setListening(true);
  }

  async function send() {
    const message = draft.trim(); if (!message || busy) return;
    const userMessage: Message = { role: "user", content: message, at: new Date().toISOString() };
    const next = [...messages, userMessage].slice(-12); setMessages((m) => [...m, userMessage]); setDraft(""); setBusy(true);
    const transcript = next.map((m) => `${m.role === "user" ? "Cameron" : "James"}: ${m.content}`).join("\n");
    const prompt = `You are James, Mission Control's orchestrator. This is a live conversation with Cameron. Continue the same conversation naturally, keep replies concise unless detail is requested, clarify the intended outcome when genuinely ambiguous, and use your Mission Control role/delegations. Do not claim work happened unless you actually executed it.\n\nRecent conversation:\n${transcript}\n\nRespond to Cameron's latest message.`;
    try {
      const response = await fetch("/api/james/message", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify({ message: prompt }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const content = String(data.response || data.stdout || data.stderr || "").trim(); const jamesMessage: Message = { role: "james", content, at: new Date().toISOString() }; setMessages((m) => [...m, jamesMessage]); if (autoSpeak) speak(content);
    } catch (error) { const content = `I couldn't complete that turn: ${error instanceof Error ? error.message : "unknown error"}`; setMessages((m) => [...m, { role: "james", content, at: new Date().toISOString() }]); }
    finally { setBusy(false); }
  }

  return <div className="flex h-full flex-col overflow-hidden">
    <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6"><div className="flex items-center gap-3"><JamesAvatar className="h-10 w-10" /><div><h1 className="font-semibold">Talk to James</h1><p className="text-xs text-muted-foreground">Mission Control Orchestrator · live Hermes conversation</p></div></div><Button variant="ghost" size="icon" onClick={() => { setAutoSpeak((v) => !v); window.speechSynthesis?.cancel(); }} aria-label={autoSpeak ? "Mute James" : "Speak James replies"}>{autoSpeak ? <Volume2 /> : <VolumeX />}</Button></header>
    <div className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto flex max-w-3xl flex-col gap-3">{messages.length === 0 && <div className="rounded-2xl border border-border bg-card p-5"><strong>James is ready.</strong><p className="mt-1 text-sm text-muted-foreground">Speak naturally or type. This conversation keeps recent context and talks to the real James Hermes runtime.</p></div>}{messages.map((m, i) => <div key={`${m.at}-${i}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto border border-border bg-card"}`}>{m.content}</div>)}{busy && <div className="mr-auto rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">James is thinking…</div>}<div ref={bottom} /></div></div>
    <div className="border-t border-border bg-background/90 p-3 backdrop-blur md:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2"><Button type="button" size="icon" variant={listening ? "destructive" : "secondary"} onClick={toggleListen} disabled={!voiceSupported || busy} aria-label={listening ? "Stop listening" : "Talk to James"}>{listening ? <MicOff /> : <Mic />}</Button><Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={voiceSupported ? (listening ? "Listening…" : "Talk or type to James…") : "Type to James… (speech recognition unavailable in this browser)"} className="min-h-[48px] max-h-32 resize-none" /><Button type="button" size="icon" onClick={() => void send()} disabled={!draft.trim() || busy} aria-label="Send to James"><Send /></Button></div><p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">Voice transcription uses your browser. James replies through the existing authenticated Mission Control runtime.</p></div>
  </div>;
}
