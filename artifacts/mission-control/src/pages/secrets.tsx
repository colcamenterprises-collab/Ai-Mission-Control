import { KeyRound } from "lucide-react";
import "./workspaces.css";

export default function Secrets() {
  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <main className="mission-canvas">
        <section className="mission-page-hero">
          <div>
            <h1 className="mission-page-title">Secrets</h1>
          </div>
          <div className="mission-metric-card max-w-xs">
            <KeyRound />
            <div>
              <span>Status</span>
              <strong>Planned</strong>
            </div>
          </div>
        </section>

        <section className="mission-panel">
          <div className="mission-panel-title">
            <div>
              <KeyRound />
              <span>Secure access details</span>
            </div>
          </div>
          <p className="mission-panel-copy">
            This area will hold passwords, API keys and access details that agents need to complete approved work.
          </p>
        </section>
      </main>
    </div>
  );
}
