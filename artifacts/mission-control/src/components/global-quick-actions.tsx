import { useState } from "react";
import { Mic, Plus } from "lucide-react";
import NoteComposer from "@/components/note-composer";
import JamesVoice from "@/pages/james-voice";
import "./global-quick-actions.css";

export default function GlobalQuickActions() {
  const [noteOpen, setNoteOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <div className="mission-quick-dock" aria-label="Quick actions">
        <button type="button" onClick={() => setNoteOpen(true)} aria-label="Quick note" title="Quick note"><Plus /></button>
        <button type="button" onClick={() => setVoiceOpen(true)} aria-label="Talk to James" title="Talk to James"><Mic /></button>
      </div>
      {noteOpen && <NoteComposer onClose={() => setNoteOpen(false)} />}
      {voiceOpen && (
        <div className="james-quick-backdrop" role="presentation" onMouseDown={() => setVoiceOpen(false)}>
          <div className="james-quick-panel" onMouseDown={(event) => event.stopPropagation()}>
            <JamesVoice compact autoStartVoice onClose={() => setVoiceOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
