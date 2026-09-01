import test from "node:test";
import assert from "node:assert/strict";
import { buildEmploymentPackFromRoleBrief, certifyEmploymentPack, employmentPackMarkdown, normalizeEmploymentPack } from "../artifacts/api-server/src/services/agent-employment-pack.ts";

test("concise role brief produces a certifiable employment pack", () => {
  const pack = buildEmploymentPackFromRoleBrief({
    title: "Financial Controller",
    business: "Smash Brothers Burgers",
    responsibilities: "Own daily financial controls, reconciliation, exception investigation and concise management reporting.",
    owner: "Business Owner",
  });
  const certification = certifyEmploymentPack(pack);
  assert.equal(certification.ready, true);
  assert.equal(certification.score, 100);
  assert.match(pack.delegations.ownerApproval, /financial actions|destructive|external commitments/i);
  assert.match(pack.escalation.doNotEscalateWhen, /first failed attempt|facts available/i);
});

test("employment pack normalization does not accept incomplete certification", () => {
  const pack = normalizeEmploymentPack({ role: { purpose: "Research AI developments" } });
  const certification = certifyEmploymentPack(pack);
  assert.equal(certification.ready, false);
  assert.ok(certification.missing.includes("delegations.autonomous"));
  assert.ok(certification.score < 100);
});

test("employment pack projects all required runtime documents", () => {
  const files = employmentPackMarkdown(buildEmploymentPackFromRoleBrief({ title: "Research Analyst", business: "Customli" }));
  assert.deepEqual(Object.keys(files).sort(), ["BOUNDARIES.md", "COMMUNICATION.md", "DELEGATIONS.md", "ESCALATION.md", "RESPONSIBILITIES.md", "ROLE.md", "SKILLS.md", "SUCCESS.md", "SYSTEMS.md"].sort());
  assert.match(files["DELEGATIONS.md"], /Owner approval/);
  assert.match(files["COMMUNICATION.md"], /Reporting format/);
});
