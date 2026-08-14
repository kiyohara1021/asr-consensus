"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { canonical, similarity, validateResult, overlappingText, compare } = require("../src/core");

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"));

test("canonical removes presentation differences and normalizes full-width characters", () => {
  assert.equal(canonical("ＡＳＲ の、比較！"), "asrの比較");
});

test("similarity is one for equivalent Japanese presentation", () => {
  assert.equal(similarity("結果が異なります。", "結果が異なります"), 1);
  assert.equal(similarity("", ""), 1);
  assert.equal(similarity("あ", "い"), 0);
});

test("validateResult explains invalid timestamps", () => {
  const invalid = fixture("primary.json");
  invalid.segments[0].end = -1;
  assert.deepEqual(validateResult(invalid), ["segments[0] has an invalid time range"]);
});

test("compare identifies only the synthetic disagreement", () => {
  const result = compare(
    fixture("primary.json"),
    [fixture("comparison-a.json"), fixture("comparison-b.json")],
    { threshold: 0.65 }
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].flagged, false);
  assert.equal(result.rows[1].flagged, false);
  assert.equal(result.rows[2].flagged, true);
  assert.ok(result.rows[2].agreement < 0.65);
});

test("alignment ignores a tiny overlap from the neighbouring segment", () => {
  const segments = [
    { start: 0, end: 5.2, text: "前の文" },
    { start: 5.2, end: 10, text: "対象の文" },
  ];
  assert.equal(overlappingText(segments, 5.1, 9.8), "対象の文");
});

test("compare keeps an untimed transcript as reference text", () => {
  const untimed = fixture("comparison-a.json");
  untimed.segments = [];
  const result = compare(fixture("primary.json"), [untimed]);
  assert.equal(result.untimed.length, 1);
  assert.equal(result.rows.every((row) => row.agreement === null), true);
});

test("compare rejects unsafe or meaningless thresholds", () => {
  const primary = fixture("primary.json");
  assert.throws(() => compare(primary, [], { threshold: "not-a-number" }), /between 0 and 1/);
  assert.throws(() => compare(primary, [], { threshold: 1.1 }), /between 0 and 1/);
});

test("compare requires timestamps only for the primary timeline", () => {
  const primary = fixture("primary.json");
  primary.segments[0].start = null;
  primary.segments[0].end = null;
  assert.throws(() => compare(primary, []), /timestamped segments/);
});
