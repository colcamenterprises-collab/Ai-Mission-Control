import { Link } from "wouter";
import { BookOpen, Brain, History, UsersRound } from "lucide-react";
import BusinessHub from "./business-hub";
import "./mission-brain.css";

export default function MissionBrain() {
  return (
    <div className="mission-brain-page">
      <header className="mission-brain-header">
        <div>
          <span className="mission-brain-kicker">Mission intelligence</span>
          <h1>Mission Brain</h1>
          <p>What Mission Control knows, what it can do, what it is working toward, and how that knowledge connects.</p>
        </div>
        <nav className="mission-brain-nav" aria-label="Mission Brain sections">
          <Link href="/brain" className="is-active"><Brain /> Brain</Link>
          <Link href="/skills"><BookOpen /> Skills</Link>
          <Link href="/brain/executions"><History /> Executions</Link>
          <Link href="/team"><UsersRound /> Agents</Link>
        </nav>
      </header>
      <section className="mission-brain-agent-model" aria-label="Portable agent model">
        <div><strong>Mission Brain</strong><span>Shared organisational memory, skills, projects and execution history.</span></div>
        <div><strong>Agent Role</strong><span>Stable responsibilities, permissions and required capabilities.</span></div>
        <div><strong>Agent Profile / Soul</strong><span>Replaceable identity and working style, separate from organisational truth.</span></div>
      </section>
      <div className="mission-brain-business-surface"><BusinessHub /></div>
    </div>
  );
}
