import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JamesAvatar } from "@/components/james-avatar";

type Message = { role: "user" | "james"; content: string; at: string };
type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: SpeechRecognitionEventLike) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global { interface Window { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor } }

const HISTORY_KEY = "mission_control_james_voice_history_v1";
const TOKEN_KEY = "mission_control_admin_token";
const LEGACY_TOKEN_KEY = "MISSION_CONTROL_ADMIN_TOKEN";

function loadHistory(): Message[] { try { const x = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(x) ? x.slice(-30) : []; } catch { return []; } }
function token() { return localStorage.getItem(TOKEN_KEY)?.trim() || localStorage.getItem(LEGACY_TOKEN_KEY)?.trim() || import.meta.env.VITE_MISSION_CONTROL_ADMIN_TOKEN?.trim() || "change-this-later"; }
function cleanSpeechText(text: string) { return text.replace(/[*#`]/g, "").replace(/\s+/g, " ").trim(); }
function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(cleanSpeechText(text));
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.lang = navigator.language || "en-AU";
  const voices = synth.getVoices();
  utterance.voice = voices.find((voice) => voice.lang === utterance.lang) || voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) || null;
  synth.cancel();
  synth.resume();
  window.setTimeout(() => { synth.resume(); synth.speak(utterance); }, 0);
}

export default function JamesVoice() {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [voiceSupported] = useState(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraft = useRef("");
  const voiceSessionTranscript = useRef("");
  const voiceAutoSend = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-30))); bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => { voiceAutoSend.current = false; recognition.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  async function send(messageOverride?: string) {
    const message = (messageOverride ?? draft).trim();
    if (!message || busy) return;
    voiceAutoSend.current = false;
    if (recognition.current) { recognition.current.stop(); recognition.current = null; setListening(false); }
    voiceBaseDraft.current = "";
    voiceSessionTranscript.current = "";
    const userMessage: Message = { role: "user", content: message, at: new Date().toISOString() };
    const next = [...messages, userMessage].slice(-12);
    setMessages((m) => [...m, userMessage]);
    setDraft("");
    setBusy(true);
    const transcript = next.map((m) => `${m.role === "user" ? "Cameron" : "James"}: ${m.content}`).join("\n");
    const prompt = `You are James, Mission Control's orchestrator. This is a live conversation with Cameron. Continue the same conversation naturally, keep replies concise unless detail is requested, clarify the intended outcome when genuinely ambiguous, and use your Mission Control role/delegations. Do not claim work happened unless you actually executed it.\n\nRecent conversation:\n${transcript}\n\nRespond to Cameron's latest message.`;
    try {
      const response = await fetch("/api/james/message", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify({ message: prompt }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.details || data.error || `HTTP ${response.status}`);
      const content = String(data.response || data.stdout || data.stderr || "").trim();
      const jamesMessage: Message = { role: "james", content, at: new Date().toISOString() };
      setMessages((m) => [...m, jamesMessage]);
      if (autoSpeak) speak(content);
    } catch (error) {
      const content = `I couldn't complete that turn: ${error instanceof Error ? error.message : "unknown error"}`;
      setMessages((m) => [...m, { role: "james", content, at: new Date().toISOString() }]);
    } finally { setBusy(false); }
  }

  function toggleListen() {
    if (listening) { recognition.current?.stop(); return; }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    recognition.current = r;
    voiceBaseDraft.current = draft.trim();
    voiceSessionTranscript.current = "";
    voiceAutoSend.current = true;
    r.continuous = false;
    r.interimResults = true;
    r.lang = navigator.language || "en-AU";
    r.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) finalText += `${finalText ? " " : ""}${transcript}`;
        else interim += `${interim ? " " : ""}${transcript}`;
      }
      const sessionTranscript = [finalText, interim].filter(Boolean).join(" ").trim();
      voiceSessionTranscript.current = sessionTranscript;
      setDraft([voiceBaseDraft.current, sessionTranscript].filter(Boolean).join(" ").trim());
    };
    r.onend = () => {
      const shouldSend = voiceAutoSend.current;
      const message = [voiceBaseDraft.current, voiceSessionTranscript.current].filter(Boolean).join(" ").trim();
      recognition.current = null;
      voiceAutoSend.current = false;
      setListening(false);
      if (shouldSend && message) window.setTimeout(() => { void send(message); }, 0);
    };
    r.onerror = () => { recognition.current = null; voiceAutoSend.current = false; setListening(false); };
    r.start();
    setListening(true);
  }

  return <div className="flex h-full flex-col overflow-hidden">
    <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6"><div className="flex items-center gap-3"><JamesAvatar className="h-10 w-10" /><div><h1 className="font-semibold">Talk to James</h1><p className="text-xs text-muted-foreground">Mission Control Orchestrator · live Hermes conversation</p></div></div><Button variant="ghost" size="icon" onClick={() => { setAutoSpeak((v) => !v); window.speechSynthesis?.cancel(); }} aria-label={autoSpeak ? "Mute James" : "Speak James replies"}>{autoSpeak ? <Volume2 /> : <VolumeX />}</Button></header>
    <div className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto flex max-w-3xl flex-col gap-3">{messages.length === 0 && <div className="rounded-2xl border border-border bg-card p-5"><strong>James is ready.</strong><p className="mt-1 text-sm text-muted-foreground">Tap the microphone once and speak normally. Your turn sends automatically when you finish, and James answers through the same live Hermes conversation.</p></div>}{messages.map((m, i) => <div key={`${m.at}-${i}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto border border-border bg-card"}`}><div>{m.content}</div>{m.role === "james" && <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => speak(m.content)} aria-label="Play James reply"><Volume2 className="h-3.5 w-3.5" />Play voice</button>}</div>)}{busy && <div className="mr-auto rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">James is thinking…</div>}<div ref={bottom} /></div></div>
    <div className="border-t border-border bg-background/90 p-3 backdrop-blur md:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2"><Button type="button" size="icon" variant={listening ? "destructive" : "secondary"} onClick={toggleListen} disabled={!voiceSupported || busy} aria-label={listening ? "Finish speaking" : "Talk to James"}>{listening ? <MicOff /> : <Mic />}</Button><Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={voiceSupported ? (listening ? "Listening… finish speaking and your turn will send automatically." : "Tap mic to talk, or type to James…") : "Type to James… (speech recognition unavailable in this browser)"} className="min-h-[48px] max-h-32 resize-none" /><Button type="button" size="icon" onClick={() => void send()} disabled={!draft.trim() || busy} aria-label="Send to James"><Send /></Button></div><p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">Voice mode is one conversational turn: speak once, James replies, then tap the microphone for your next turn.</p></div>
  </div>;
}
