export type EmploymentPack = {
  role: { purpose: string; title: string; business: string };
  responsibilities: { owns: string; supports: string; recurring: string };
  delegations: { autonomous: string; orchestratorApproval: string; ownerApproval: string; prohibited: string };
  systems: { required: string; optional: string; accessRules: string };
  skills: { required: string; preferred: string; certification: string };
  communication: { ownerStyle: string; orchestratorStyle: string; peerStyle: string; reportingFormat: string };
  escalation: { escalateWhen: string; doNotEscalateWhen: string; evidenceRequired: string };
  success: { outcomes: string; qualityBar: string; serviceLevel: string };
  boundaries: { neverDo: string; dataBoundaries: string; externalActionBoundaries: string };
};

export type EmploymentPackCertification = {
  ready: boolean;
  score: number;
  missing: string[];
};

const clean = (value: unknown, max = 12000): string => typeof value === "string" ? value.trim().slice(0, max) : "";

export function emptyEmploymentPack(): EmploymentPack {
  return {
    role: { purpose: "", title: "", business: "" },
    responsibilities: { owns: "", supports: "", recurring: "" },
    delegations: { autonomous: "", orchestratorApproval: "", ownerApproval: "", prohibited: "" },
    systems: { required: "", optional: "", accessRules: "" },
    skills: { required: "", preferred: "", certification: "" },
    communication: { ownerStyle: "", orchestratorStyle: "", peerStyle: "", reportingFormat: "" },
    escalation: { escalateWhen: "", doNotEscalateWhen: "", evidenceRequired: "" },
    success: { outcomes: "", qualityBar: "", serviceLevel: "" },
    boundaries: { neverDo: "", dataBoundaries: "", externalActionBoundaries: "" },
  };
}

export function normalizeEmploymentPack(value: unknown): EmploymentPack {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const section = (name: string) => input[name] && typeof input[name] === "object" ? input[name] as Record<string, unknown> : {};
  const role = section("role"); const responsibilities = section("responsibilities"); const delegations = section("delegations");
  const systems = section("systems"); const skills = section("skills"); const communication = section("communication");
  const escalation = section("escalation"); const success = section("success"); const boundaries = section("boundaries");
  return {
    role: { purpose: clean(role.purpose), title: clean(role.title), business: clean(role.business) },
    responsibilities: { owns: clean(responsibilities.owns), supports: clean(responsibilities.supports), recurring: clean(responsibilities.recurring) },
    delegations: { autonomous: clean(delegations.autonomous), orchestratorApproval: clean(delegations.orchestratorApproval), ownerApproval: clean(delegations.ownerApproval), prohibited: clean(delegations.prohibited) },
    systems: { required: clean(systems.required), optional: clean(systems.optional), accessRules: clean(systems.accessRules) },
    skills: { required: clean(skills.required), preferred: clean(skills.preferred), certification: clean(skills.certification) },
    communication: { ownerStyle: clean(communication.ownerStyle), orchestratorStyle: clean(communication.orchestratorStyle), peerStyle: clean(communication.peerStyle), reportingFormat: clean(communication.reportingFormat) },
    escalation: { escalateWhen: clean(escalation.escalateWhen), doNotEscalateWhen: clean(escalation.doNotEscalateWhen), evidenceRequired: clean(escalation.evidenceRequired) },
    success: { outcomes: clean(success.outcomes), qualityBar: clean(success.qualityBar), serviceLevel: clean(success.serviceLevel) },
    boundaries: { neverDo: clean(boundaries.neverDo), dataBoundaries: clean(boundaries.dataBoundaries), externalActionBoundaries: clean(boundaries.externalActionBoundaries) },
  };
}

export function buildEmploymentPackFromRoleBrief(input: { title: string; business: string; responsibilities?: string | null; owner?: string | null }): EmploymentPack {
  const responsibilities = clean(input.responsibilities) || `Own the normal outcomes expected of the ${input.title} role for ${input.business}.`;
  const owner = clean(input.owner) || "the business owner";
  return normalizeEmploymentPack({
    role: { title: input.title, business: input.business, purpose: `Deliver the ${input.title} function for ${input.business} and own the outcomes described in the role brief.` },
    responsibilities: { owns: responsibilities, supports: "Support the orchestrator and relevant specialist employees when work overlaps this role.", recurring: "Recurring duties must be represented as canonical Mission Control tasks, not hidden profile schedules." },
    delegations: {
      autonomous: "Research, inspect available systems, analyse evidence, communicate internally, retry reversible work, and make routine role decisions within granted system permissions.",
      orchestratorApproval: "Seek orchestrator approval for consequential but reversible internal changes that exceed routine role judgement.",
      ownerApproval: "Escalate protected financial actions, destructive changes, external commitments, credential/security changes, material expenditure, or explicit owner-judgement decisions.",
      prohibited: "Never bypass Mission Control approval policy, fabricate access or evidence, expose credentials, or claim completion without verification.",
    },
    systems: { required: "Use the Mission Control systems, tools, repositories, knowledge and integrations explicitly granted to this employee for assigned work.", optional: "Use additional approved company capabilities only when directly relevant to the assigned outcome.", accessRules: "Search available company systems before asking for facts. Access only role-relevant data and never infer permissions that have not been granted." },
    skills: { required: `Apply the approved company skills and procedures relevant to the ${input.title} role.`, preferred: "Prefer reusable, auditable procedures over ad-hoc manual work.", certification: "The employee must demonstrate retrieval, judgement, execution, reporting and escalation behaviour against a representative role task before being considered operationally certified." },
    communication: { ownerStyle: `Communicate with ${owner} concisely: lead with outcome, exception or required decision; avoid raw analysis unless requested.`, orchestratorStyle: "Give James concise status, evidence, blocker and next action. Discuss ordinary blockers with James instead of escalating them directly to the owner.", peerStyle: "Be factual, specific and collaborative. State exactly what another employee needs to do and what evidence is required.", reportingFormat: "Outcome first; evidence second; exceptions/blockers third; next action last. Keep routine reports concise." },
    escalation: { escalateWhen: "Escalate when owner authority is genuinely required, required access remains unavailable after investigation, policy prohibits autonomous action, or delegated recovery is exhausted.", doNotEscalateWhen: "Do not escalate ordinary uncertainty, a first failed attempt, facts available in connected systems, reversible execution choices, or routine role decisions.", evidenceRequired: "State the exact blocker, sources checked, attempts made, authority boundary, options considered and the smallest decision required." },
    success: { outcomes: responsibilities, qualityBar: "Results must be factual, complete for the requested outcome, evidence-backed, proportionate, and compliant with Mission Control policy and role procedures.", serviceLevel: "Keep active work moving. Maintain a concrete next action and respond to orchestrator review/rework without owner shepherding." },
    boundaries: { neverDo: "Never invent facts, hide uncertainty, silently change business policy, bypass approvals, expose secrets, or mark work complete merely because a command succeeded.", dataBoundaries: "Use only data relevant to assigned work and granted role scope. Treat credentials, personal data and sensitive business information as protected.", externalActionBoundaries: "Do not send consequential external communications, spend money, make financial commitments, publish, deploy protected changes or perform destructive actions unless current delegation explicitly permits it." },
  });
}

export function certifyEmploymentPack(pack: EmploymentPack): EmploymentPackCertification {
  const required: Array<[string, string]> = [
    ["role.purpose", pack.role.purpose], ["responsibilities.owns", pack.responsibilities.owns], ["delegations.autonomous", pack.delegations.autonomous],
    ["delegations.ownerApproval", pack.delegations.ownerApproval], ["systems.required", pack.systems.required], ["skills.required", pack.skills.required],
    ["communication.ownerStyle", pack.communication.ownerStyle], ["communication.reportingFormat", pack.communication.reportingFormat],
    ["escalation.escalateWhen", pack.escalation.escalateWhen], ["success.outcomes", pack.success.outcomes], ["success.qualityBar", pack.success.qualityBar], ["boundaries.neverDo", pack.boundaries.neverDo],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  return { ready: missing.length === 0, score: Math.round(((required.length - missing.length) / required.length) * 100), missing };
}

export function employmentPackMarkdown(pack: EmploymentPack): Record<string, string> {
  const value = (text: string) => text || "Not yet defined.";
  return {
    "ROLE.md": `# Role\n\n## Title\n${value(pack.role.title)}\n\n## Purpose\n${value(pack.role.purpose)}\n\n## Business / scope\n${value(pack.role.business)}\n`,
    "RESPONSIBILITIES.md": `# Responsibilities\n\n## Owns\n${value(pack.responsibilities.owns)}\n\n## Supports\n${value(pack.responsibilities.supports)}\n\n## Recurring responsibilities\n${value(pack.responsibilities.recurring)}\n`,
    "DELEGATIONS.md": `# Delegations\n\n## Autonomous authority\n${value(pack.delegations.autonomous)}\n\n## Orchestrator approval\n${value(pack.delegations.orchestratorApproval)}\n\n## Owner approval\n${value(pack.delegations.ownerApproval)}\n\n## Prohibited\n${value(pack.delegations.prohibited)}\n`,
    "SYSTEMS.md": `# Systems\n\n## Required systems\n${value(pack.systems.required)}\n\n## Optional systems\n${value(pack.systems.optional)}\n\n## Access rules\n${value(pack.systems.accessRules)}\n`,
    "SKILLS.md": `# Skills\n\n## Required\n${value(pack.skills.required)}\n\n## Preferred\n${value(pack.skills.preferred)}\n\n## Certification\n${value(pack.skills.certification)}\n`,
    "COMMUNICATION.md": `# Communication\n\n## Owner\n${value(pack.communication.ownerStyle)}\n\n## Orchestrator\n${value(pack.communication.orchestratorStyle)}\n\n## Peers\n${value(pack.communication.peerStyle)}\n\n## Reporting format\n${value(pack.communication.reportingFormat)}\n`,
    "ESCALATION.md": `# Escalation\n\n## Escalate when\n${value(pack.escalation.escalateWhen)}\n\n## Do not escalate when\n${value(pack.escalation.doNotEscalateWhen)}\n\n## Evidence required\n${value(pack.escalation.evidenceRequired)}\n`,
    "SUCCESS.md": `# Success\n\n## Outcomes\n${value(pack.success.outcomes)}\n\n## Quality bar\n${value(pack.success.qualityBar)}\n\n## Service level\n${value(pack.success.serviceLevel)}\n`,
    "BOUNDARIES.md": `# Boundaries\n\n## Never do\n${value(pack.boundaries.neverDo)}\n\n## Data boundaries\n${value(pack.boundaries.dataBoundaries)}\n\n## External action boundaries\n${value(pack.boundaries.externalActionBoundaries)}\n`,
  };
}
