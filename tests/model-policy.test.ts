import test from "node:test";
import assert from "node:assert/strict";
import { classifyModelTask, defaultPolicyFor, openRouterCostTier } from "../artifacts/api-server/src/services/model-policy-rules.ts";

test("research defaults to free OpenRouter routing", () => {
  const policy = defaultPolicyFor("research");
  assert.equal(policy.primaryModel, "openrouter/free");
  assert.equal(policy.maxCostClass, "free");
});

test("coding uses cost-conscious auto routing", () => {
  const policy = defaultPolicyFor("coding");
  assert.equal(policy.primaryModel, "openrouter/auto");
  assert.equal(policy.maxCostClass, "standard");
  assert.equal(openRouterCostTier(policy), "medium");
});

test("finance and orchestration use stronger policy classes", () => {
  assert.equal(defaultPolicyFor("finance").policyClass, "strong");
  assert.equal(defaultPolicyFor("orchestration").policyClass, "strong");
  assert.equal(openRouterCostTier(defaultPolicyFor("finance")), "high");
});

test("role/task classifier separates common employee work", () => {
  assert.equal(classifyModelTask("AI Intelligence Analyst", "daily research"), "research");
  assert.equal(classifyModelTask("Financial Controller", "reconcile banking"), "finance");
  assert.equal(classifyModelTask("Developer", "fix TypeScript bug"), "coding");
  assert.equal(classifyModelTask("James Orchestrator", "review worker result"), "orchestration");
  assert.equal(classifyModelTask("Marketing Coordinator", "write social campaign"), "marketing");
});
