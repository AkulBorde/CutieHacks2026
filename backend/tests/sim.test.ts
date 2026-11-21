// Owner: simulation. Run with: npm test -w @rollcall/backend
import assert from "node:assert/strict";
import { test } from "node:test";
import { allSimStudents, SIM_HALLS, simulatedAnswers, simulatedDelayMs, simulatedOutcome } from "../convex/lib/simData.ts";
import { deriveStatus } from "../convex/lib/status.ts";

test("every housing community has made-up students and no phones", () => {
  const students = allSimStudents();
  assert.equal(students.length, SIM_HALLS.reduce((a, h) => a + h.students, 0));
  for (const h of SIM_HALLS) assert.ok(students.some((s) => s.hall === h.name), h.name);
  for (const s of students) assert.ok(!("phone" in s));
});

test("simulated answers go through the real status rule", () => {
  const ids = Array.from({ length: 500 }, (_, i) => `check${i}`);
  const tally: Record<string, number> = {};
  for (const id of ids) {
    const outcome = simulatedOutcome(id);
    const answers = simulatedAnswers(outcome, "Lothian, room E210", id);
    const status = answers ? deriveStatus(answers) : "no_answer";
    // The rule must agree with the outcome the simulator intended.
    assert.equal(status, outcome);
    tally[status] = (tally[status] ?? 0) + 1;
  }
  assert.ok(tally.safe > 300, "mostly safe");
  assert.ok(tally.needs_help > 20 && tally.urgent > 5 && tally.no_answer > 20);
});

test("delays are between 4 and 40 seconds and stable", () => {
  for (let i = 0; i < 100; i++) {
    const d = simulatedDelayMs(`c${i}`);
    assert.ok(d >= 4000 && d <= 40000);
    assert.equal(d, simulatedDelayMs(`c${i}`));
  }
});
