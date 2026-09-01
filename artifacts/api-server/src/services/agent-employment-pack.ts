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
  const role = section("role");
  const responsibilities = section("responsibilities");
  const delegations = section("delegations");
  const systems = section("systems");
  const skills = section("skills");
  const communication = section("communication");
  const escalation = section("escalation");
  const success = section("success");
  const boundaries = section("boundaries");
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

export function certifyEmploymentPack(pack: EmploymentPack): EmploymentPackCertification {
  const required: Array<[string, string]> = [
    ["role.purpose", pack.role.purpose],
    ["responsibilities.owns", pack.responsibilities.owns],
    ["delegations.autonomous", pack.delegations.autonomous],
    ["delegations.ownerApproval", pack.delegations.ownerApproval],
    ["systems.required", pack.systems.required],
    ["skills.required", pack.skills.required],
    ["communication.ownerStyle", pack.communication.ownerStyle],
    ["communication.reportingFormat", pack.communication.reportingFormat],
    ["escalation.escalateWhen", pack.escalation.escalateWhen],
    ["success.outcomes", pack.success.outcomes],
    ["success.qualityBar", pack.success.qualityBar],
    ["boundaries.neverDo", pack.boundaries.neverDo],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  const score = Math.round(((required.length - missing.length) / required.length) * 100);
  return { ready: missing.length === 0, score, missing };
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
