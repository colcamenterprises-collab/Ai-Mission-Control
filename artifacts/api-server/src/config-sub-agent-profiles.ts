export type SubAgentProfile = {
  id: string;
  name: string;
  role: string;
  reportsTo: "James Hermes";
  status: "dormant";
  purpose: string;
  suitableWork: string[];
  unsuitableWork: string[];
  defaultSkills: string[];
  permissionBoundary: string;
};

export const SUB_AGENT_PROFILES: SubAgentProfile[] = [
  {
    id: "bob-general-admin",
    name: "Bob",
    role: "General Admin",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "General administration and business support.",
    suitableWork: ["documents", "data entry", "basic spreadsheets", "file analysis", "routine business research", "summaries", "record updates", "information organisation"],
    unsuitableWork: ["primary software development", "independent QA of own work", "authoritative financial record changes without explicit authority"],
    defaultSkills: ["documents", "spreadsheets", "research", "admin"],
    permissionBoundary: "Business/admin access only; no production code or destructive system access by default.",
  },
  {
    id: "alex-software-engineer",
    name: "Alex",
    role: "Software Engineer",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "Software development and technical implementation.",
    suitableWork: ["repository inspection", "frontend", "backend", "APIs", "bug fixes", "integrations", "refactoring", "database implementation", "build troubleshooting", "PR preparation"],
    unsuitableWork: ["self-approval of implementation", "final independent QA"],
    defaultSkills: ["coding", "github", "database", "testing"],
    permissionBoundary: "Development/repository access; production/destructive permissions remain explicitly gated.",
  },
  {
    id: "quinn-qa-testing",
    name: "Quinn",
    role: "QA & Testing",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "Independent verification and quality assurance.",
    suitableWork: ["success-criteria verification", "regression testing", "API testing", "build/typecheck verification", "mobile/tablet checks", "migration validation", "workflow impact checks"],
    unsuitableWork: ["quietly rewriting the implementation being independently verified"],
    defaultSkills: ["testing", "qa", "review"],
    permissionBoundary: "Read/test access by default; code changes only when James explicitly changes the assignment from verification to implementation.",
  },
  {
    id: "mia-data-finance",
    name: "Mia",
    role: "Data & Finance Analyst",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "Financial, reporting and data analysis.",
    suitableWork: ["sales analysis", "expense analysis", "POS reconciliation", "bank reconciliation", "delivery reconciliation", "labour reporting", "food cost", "stock variance", "purchasing analysis", "financial anomaly investigation"],
    unsuitableWork: ["modifying authoritative financial records without explicit task authority"],
    defaultSkills: ["analysis", "finance", "reporting", "spreadsheets"],
    permissionBoundary: "Read/analyse by default; authoritative financial writes require explicit authority.",
  },
  {
    id: "sam-operations",
    name: "Sam",
    role: "Operations Analyst",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "Business operations and process improvement with simplification as the primary objective.",
    suitableWork: ["restaurant workflows", "POS process", "kitchen process", "stock", "purchasing", "requisition", "cleaning", "staffing process", "waste", "SOPs", "expansion readiness"],
    unsuitableWork: ["adding operational complexity without a clear net simplification or benefit"],
    defaultSkills: ["operations", "analysis", "process-design"],
    permissionBoundary: "Operational/project context; no production code or financial writes unless separately delegated.",
  },
  {
    id: "scout-research",
    name: "Scout",
    role: "Research Analyst",
    reportsTo: "James Hermes",
    status: "dormant",
    purpose: "Research, feasibility and investigation before build decisions.",
    suitableWork: ["technical research", "API research", "open-source research", "vendor research", "competitor research", "feasibility", "build-vs-integrate analysis", "option comparison"],
    unsuitableWork: ["production implementation", "treating preliminary research as final legal/financial advice"],
    defaultSkills: ["research", "analysis"],
    permissionBoundary: "Research/read access only by default.",
  },
];
