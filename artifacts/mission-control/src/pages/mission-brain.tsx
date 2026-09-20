import { Brain } from "lucide-react";
import BusinessHub from "./business-hub";
import { MissionBrainGraph } from "@/components/mission-brain-graph";
import "./mission-brain.css";

export default function MissionBrain() {
  return (
    <div className="mission-brain-page">
      <header className="mission-brain-header">
        <div>
          <span className="mission-brain-kicker">Mission intelligence</span>
          <h1>Mission Brain</h1>
          <p>
            What Mission Control knows, the projects it understands, and how
            durable organisational knowledge connects.
          </p>
        </div>
        <div className="mission-brain-scope">
          <Brain />
          <span>Organisational memory, projects and durable knowledge</span>
        </div>
      </header>
      <section className="mission-brain-agent-model" aria-label="Mission Brain scope">
        <div>
          <strong>Organisational Memory</strong>
          <span>Durable facts, decisions and validated knowledge retained by Mission Control.</span>
        </div>
        <div>
          <strong>Projects & Context</strong>
          <span>Business and system context that gives stored knowledge a clear operating home.</span>
        </div>
        <div>
          <strong>Knowledge Graph</strong>
          <span>Relationships between memories, projects and the information Mission Control relies on.</span>
        </div>
      </section>
      <MissionBrainGraph />
      <div className="mission-brain-business-surface">
        <BusinessHub />
      </div>
    </div>
  );
}
