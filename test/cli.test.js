"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

test("CLI produces Markdown and JSON from anonymous fixtures", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "asr-consensus-test-"));
  const report = path.join(work, "report.md");
  const data = path.join(work, "report.json");
  try {
    execFileSync(process.execPath, [
      path.join(root, "src", "consensus.js"),
      "--primary", path.join(root, "fixtures", "primary.json"),
      "--other", path.join(root, "fixtures", "comparison-a.json"),
      "--other", path.join(root, "fixtures", "comparison-b.json"),
      "--output", report,
      "--json", data,
    ]);
    assert.match(fs.readFileSync(report, "utf8"), /要判定/);
    const parsed = JSON.parse(fs.readFileSync(data, "utf8"));
    assert.equal(parsed.schemaVersion, "1.0");
    assert.equal(parsed.primary, "engine-a");
    assert.equal(parsed.rows.length, 3);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test("CLI reports an invalid threshold without a stack trace", () => {
  const result = spawnSync(process.execPath, [
    path.join(root, "src", "consensus.js"),
    "--primary", path.join(root, "fixtures", "primary.json"),
    "--output", path.join(os.tmpdir(), "asr-consensus-invalid.md"),
    "--threshold", "invalid",
  ], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /threshold must be a number/);
  assert.doesNotMatch(result.stderr, /at compare/);
});

test("render CLI creates a readable transcript from the standard schema", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "asr-render-test-"));
  const output = path.join(work, "transcript.txt");
  try {
    execFileSync(process.execPath, [
      path.join(root, "src", "render.js"),
      "--input", path.join(root, "fixtures", "primary.json"),
      "--output", output,
      "--speaker", "speaker_0=説明者",
    ]);
    assert.match(fs.readFileSync(output, "utf8"), /説明者：今日は公開データ/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});
