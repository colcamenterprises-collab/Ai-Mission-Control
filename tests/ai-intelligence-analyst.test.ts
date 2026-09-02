import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_INTELLIGENCE_TASK,
  buildAIIntelligenceAnalystEmploymentPack,
  certifyAIIntelligenceAnalystPack,
  scoreIntelligenceFinding,
} from "../artifacts/api-server/src/services/ai-intelligence-analyst.ts";

test("AI Intelligence Analyst employment pack is complete and low-noise", () => {
  const pack = buildAIIntelligenceAnalystEmploymentPack();
  const certification = certifyAIIntelligenceAnalystPack();
  assert.equal(certification.ready, true);
  assert.equal(certification.score, 100);
  assert.match(pack.responsibilities.owns, /Repo of the Day/);
  assert.match(pack.communication.reportingFormat, /No repo qualifies today/);
  assert.match(pack.boundaries.neverDo, /generic AI news/);
});

test("daily intelligence duty is a canonical recurring Mission Control task", () => {
  assert.equal(DAILY_INTELLIGENCE_TASK.recurrence, "daily");
  assert.equal(DAILY_INTELLIGENCE_TASK.assignee, "AI Intelligence Analyst");
  assert.equal(DAILY_INTELLIGENCE_TASK.approvalRequired, false);
  assert.match(DAILY_INTELLIGENCE_TASK.description, /Hermes/);
  assert.match(DAILY_INTELLIGENCE_TASK.description, /OpenClaw/);
  assert.match(DAILY_INTELLIGENCE_TASK.description, /OpenRouter/);
});

test("high-value low-risk findings can reach James-governed IMPLEMENT", () => {
  const result = scoreIntelligenceFinding({ relevance: 5, businessBenefit: 5, missionControlBenefit: 5, implementationComplexity: 1, securityRisk: 1, operationalRisk: 1, costImpact: 1, evidenceQuality: 5 });
  assert.equal(result.decision, "IMPLEMENT");
  assert.equal(result.requiresJamesReview, true);
  assert.equal(result.requiresOwnerApproval, false);
});

test("protected risk prevents autonomous implementation and requires owner approval", () => {
  const result = scoreIntelligenceFinding({ relevance: 5, businessBenefit: 5, missionControlBenefit: 5, implementationComplexity: 1, securityRisk: 5, operationalRisk: 1, costImpact: 1, evidenceQuality: 5 });
  assert.notEqual(result.decision, "IMPLEMENT");
  assert.equal(result.requiresOwnerApproval, true);
});

test("low-value noisy findings are ignored", () => {
  const result = scoreIntelligenceFinding({ relevance: 1, businessBenefit: 1, missionControlBenefit: 1, implementationComplexity: 4, securityRisk: 3, operationalRisk: 3, costImpact: 4, evidenceQuality: 1 });
  assert.equal(result.decision, "IGNORE");
  assert.equal(result.requiresJamesReview, false);
});
