import { Sparkles } from "lucide-react";
import "./workspaces.css";

export default function Onboarding() {
  return (
    <div className="workspaces-shell flex h-full flex-col overflow-y-auto">
      <main className="mission-canvas">
        <section className="mission-page-hero">
          <div>
            <h1 className="mission-page-title">Getting Started</h1>
          </div>
          <div className="mission-metric-card max-w-xs">
            <Sparkles />
            <div>
              <span>Status</span>
              <strong>Blank</strong>
            </div>
          </div>
        </section>

        <section className="mission-panel">
          <div className="mission-panel-title">
            <div>
              <Sparkles />
              <span>Onboarding will live here</span>
            </div>
          </div>
          <p className="mission-panel-copy">
            This section is reserved for setting up a blank Mission Control workspace from zero: agents, work, projects, schedules and first instructions.
          </p>
        </section>
      </main>
    </div>
  );
}
