#!/usr/bin/env node

// Lines up several engines' output on one timeline and marks where they disagree.
// The point is not to pick a winner automatically — it is to reduce the audio you
// have to re-listen to down to the handful of spots the engines actually fight over.

const fs = require("fs");
const path = require("path");
const { normalize } = require("./normalize");

function usage() {
  console.error(
    [
      "Usage: node src/consensus.js --primary <result.json> [--other <result.json>]... --output <report.md>",
      "",
      "  --primary    timestamped result used as the timeline (ElevenLabs recommended)",
      "  --other      additional result to compare against, repeatable",
      "  --json       also write the aligned data here",
      "  --threshold  similarity below this is flagged 要判定 (default: 0.65)",
    ].join("\n")
  );
}

function valueAfter(flag, args) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function valuesAfter(flag, args) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1] !== undefined) values.push(args[i + 1]);
  }
  return values;
}

function timestamp(seconds) {
  const rounded = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

// Punctuation and spacing differ per engine and carry no information about whether
// the engines actually heard the same thing.
function canonical(text) {
  return String(text)
    .replace(/[\s、。，．,.!?！？「」『』（）()]/g, "")
    .toLowerCase();
}

// Dice coefficient over character bigrams — cheap and behaves well on Japanese,
// where token boundaries are not marked.
function similarity(a, b) {
  const left = canonical(a);
  const right = canonical(b);
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const counts = new Map();
  for (let i = 0; i < left.length - 1; i += 1) {
    const gram = left.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const gram = right.slice(i, i + 2);
    const available = counts.get(gram) || 0;
    if (available > 0) {
      counts.set(gram, available - 1);
      hits += 1;
    }
  }
  return (2 * hits) / (left.length - 1 + (right.length - 1));
}

function overlappingText(segments, start, end) {
  const parts = [];
  for (const segment of segments) {
    if (segment.start === null || segment.end === null) continue;
    if (segment.end <= start || segment.start >= end) continue;
    parts.push(segment.text);
  }
  return parts.join("").trim();
}

const args = process.argv.slice(2);
const primaryPath = valueAfter("--primary", args);
const otherPaths = valuesAfter("--other", args);
const output = valueAfter("--output", args);
const jsonOutput = valueAfter("--json", args);
const threshold = Number(valueAfter("--threshold", args) || 0.65);

if (!primaryPath || !output) {
  usage();
  process.exit(2);
}

function load(file) {
  return normalize(JSON.parse(fs.readFileSync(file, "utf8")), path.basename(file, ".json"));
}

const primary = load(primaryPath);
const others = otherPaths.map(load);

if (primary.segments.length === 0 || primary.segments[0].start === null) {
  console.error(`--primary must have timestamps: ${primaryPath}`);
  process.exit(2);
}

const timed = others.filter((o) => o.segments.some((s) => s.start !== null));
const untimed = others.filter((o) => !o.segments.some((s) => s.start !== null));

const rows = primary.segments.map((segment) => {
  const comparisons = timed.map((other) => {
    const text = overlappingText(other.segments, segment.start, segment.end);
    return { source: other.source, text, score: similarity(segment.text, text) };
  });
  const worst = comparisons.reduce((min, c) => Math.min(min, c.score), 1);
  return {
    start: segment.start,
    end: segment.end,
    speaker: segment.speaker,
    primary: segment.text,
    comparisons,
    agreement: comparisons.length === 0 ? null : worst,
    flagged: comparisons.length > 0 && worst < threshold,
  };
});

const flaggedCount = rows.filter((r) => r.flagged).length;
const lines = [
  "# 合議レポート",
  "",
  `- 基準（タイムライン）: \`${primary.source}\``,
  ...timed.map((o) => `- 比較対象（時刻あり）: \`${o.source}\`${o.approximateTimings ? "　※時刻は文字数按分による推定" : ""}`),
  ...untimed.map((o) => `- 比較対象（時刻なし・全文のみ）: \`${o.source}\``),
  `- 判定しきい値: ${threshold}`,
  `- 要判定: ${flaggedCount} / ${rows.length} セグメント`,
  "",
  "`要判定` は基準と比較対象の一致度がしきい値未満の箇所です。ここだけ音声を聞き直せば足ります。",
  "",
];

for (const row of rows) {
  const mark = row.flagged ? " ⚠️ 要判定" : "";
  const score = row.agreement === null ? "-" : row.agreement.toFixed(2);
  lines.push(`## ${timestamp(row.start)}〜${timestamp(row.end)}　${row.speaker || "話者不明"}（一致度 ${score}）${mark}`);
  lines.push("");
  lines.push(`- **${primary.source}**: ${row.primary}`);
  for (const comparison of row.comparisons) {
    lines.push(`- ${comparison.source}: ${comparison.text || "（該当なし）"}`);
  }
  lines.push("");
}

for (const other of untimed) {
  lines.push(`## 参考：${other.source}（時刻なし全文）`, "", other.text, "");
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Saved consensus report: ${output} (${flaggedCount}/${rows.length} flagged)`);

if (jsonOutput) {
  fs.mkdirSync(path.dirname(path.resolve(jsonOutput)), { recursive: true });
  fs.writeFileSync(jsonOutput, `${JSON.stringify({ primary: primary.source, threshold, rows }, null, 2)}\n`, "utf8");
  console.log(`Saved consensus data: ${jsonOutput}`);
}
