import test from "node:test";
import assert from "node:assert/strict";
import { buildJustinEmploymentPack, certifyJustinOperationsManager } from "../artifacts/api-server/src/services/justin-operations-manager.js";
import { certifyEmploymentPack } from "../artifacts/api-server/src/services/agent-employment-pack.js";

test("Justin has a complete SBB Operations Manager employment pack", () => {
  const pack = buildJustinEmploymentPack();
  const certification = certifyEmploymentPack(pack);
  assert.equal(pack.role.title, "Operations Manager");
  assert.equal(pack.role.business, "Smash Brothers Burgers");
  assert.match(pack.responsibilities.owns, /supplier/i);
  assert.match(pack.responsibilities.owns, /theoretical stock usage/i);
  assert.match(pack.systems.accessRules, /actual stock/i);
  assert.match(pack.communication.peerStyle, /one precise contextual question/i);
  assert.equal(certification.ready, true);
});

test("Justin cannot be operationally certified from role text alone", () => {
  const result = certifyJustinOperationsManager();
  assert.equal(result.ready, false);
  assert.ok(result.access.every(item => item.status === "MISSING"));
  assert.ok(result.checks.every(check => check.passed === false));
});

test("Justin certification requires live access and demonstrated workflow", () => {
  const result = certifyJustinOperationsManager({
    availableSystems: ["SBB App", "Mission Control Knowledge"],
    demonstrated: {
      retrieve: true,
      costing: true,
      stockReview: true,
      investigate: true,
      delegatedDecision: true,
      conciseReport: true,
      correctEscalation: true,
    },
  });
  assert.equal(result.ready, true);
  assert.equal(result.score, 100);
});
