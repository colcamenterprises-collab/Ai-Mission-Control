import test from "node:test";
import assert from "node:assert/strict";
import { AMANDA_SBB_CONTROL_RULES, buildAmandaEmploymentPack, certifyAmandaFinancialController } from "../artifacts/api-server/src/services/amanda-financial-controller.ts";
import { certifyEmploymentPack } from "../artifacts/api-server/src/services/agent-employment-pack.ts";

test("Amanda has a complete SBB Financial Controller employment pack", () => {
  const pack = buildAmandaEmploymentPack();
  const certification = certifyEmploymentPack(pack);
  assert.equal(certification.ready, true);
  assert.equal(certification.score, 100);
  assert.match(pack.communication.ownerStyle, /maximum of five bullets/i);
  assert.match(pack.systems.accessRules, /never pretend/i);
  assert.match(pack.delegations.ownerApproval, /moving or paying money/i);
  assert.match(pack.escalation.doNotEscalateWhen, /first query failed/i);
});

test("Amanda embeds current SBB finance control constants", () => {
  assert.equal(AMANDA_SBB_CONTROL_RULES.startingCashThb, 2500);
  assert.equal(AMANDA_SBB_CONTROL_RULES.tolerances.registerThb, 30);
  assert.equal(AMANDA_SBB_CONTROL_RULES.tolerances.rollsPieces, 5);
  assert.equal(AMANDA_SBB_CONTROL_RULES.tolerances.meatGrams, 500);
  assert.equal(AMANDA_SBB_CONTROL_RULES.tolerances.drinksUnits, 3);
  assert.equal(AMANDA_SBB_CONTROL_RULES.alerts.cashShortThb, 500);
  assert.equal(AMANDA_SBB_CONTROL_RULES.alerts.criticalCashShortThb, 3000);
});

test("Amanda cannot be operationally certified from profile text alone", () => {
  const result = certifyAmandaFinancialController();
  assert.equal(result.ready, false);
  assert.ok(result.access.every(item => item.status === "MISSING"));
  assert.equal(result.checks.every(check => check.passed === false), true);
});

test("Amanda certification requires access and demonstrated workflow", () => {
  const availableSystems = ["SBB App", "Loyverse POS", "Grab Merchant", "Mission Control Knowledge"];
  const incomplete = certifyAmandaFinancialController({ availableSystems, demonstrated: { retrieve: true, identify: true, investigate: true } });
  assert.equal(incomplete.ready, false);
  const complete = certifyAmandaFinancialController({ availableSystems, demonstrated: { retrieve: true, identify: true, investigate: true, delegatedDecision: true, conciseReport: true, correctEscalation: true } });
  assert.equal(complete.ready, true);
  assert.equal(complete.score, 100);
  assert.equal(complete.access.every(item => item.status === "READY"), true);
});
