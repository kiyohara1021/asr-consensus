#!/usr/bin/env node

// Lines up several engines' output on one timeline and marks where they disagree.
// The point is not to pick a winner automatically — it is to reduce the audio you
// have to re-listen to down to the handful of spots the engines actually fight over.

const fs = require("fs");
const path = require("path");
const { normalize } = require("./normalize");
const { compare } = require("./core");

function usage() {
  console.error(
    [
      "Usage: node src/consensus.js --primary <result.json> [--other <result.json>]... --output <report.md>",
      "",
      "  --primary    timestamped result used as the review timeline",
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

function markdown(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]<>#+.!|~-])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
}

const args = process.argv.slice(2);
const primaryPath = valueAfter("--primary", args);
const otherPaths = valuesAfter("--other", args);
const output = valueAfter("--output", args);
const jsonOutput = valueAfter("--json", args);
const thresholdValue = valueAfter("--threshold", args);
const threshold = thresholdValue === undefined ? 0.65 : Number(thresholdValue);

if (!primaryPath || !output) {
  usage();
  process.exit(2);
}

function load(file) {
  try {
    return normalize(JSON.parse(fs.readFileSync(file, "utf8")), path.basename(file, ".json"));
  } catch (error) {
    throw new Error(`Could not load ${file}: ${error.message}`);
  }
}

let primary;
let others;
try {
  primary = load(primaryPath);
  others = otherPaths.map(load);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (primary.segments.length === 0 || primary.segments[0].start === null) {
  console.error(`--primary must have timestamps: ${primaryPath}`);
  process.exit(2);
}

let result;
try {
  result = compare(primary, others, { threshold });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { rows, untimed } = result;
const timed = others.filter((o) => !untimed.includes(o));

const flaggedCount = rows.filter((r) => r.flagged).length;
const lines = [
  "# 合議レポート",
  "",
  `- 基準（タイムライン）: ${markdown(primary.source)}`,
  ...timed.map((o) => `- 比較対象（時刻あり）: ${markdown(o.source)}${o.approximateTimings ? "　※時刻は文字数按分による推定" : ""}`),
  ...untimed.map((o) => `- 比較対象（時刻なし・全文のみ）: ${markdown(o.source)}`),
  `- 判定しきい値: ${threshold}`,
  `- 要判定: ${flaggedCount} / ${rows.length} セグメント`,
  "",
  "`要判定` は基準と比較対象の一致度がしきい値未満の箇所です。ここだけ音声を聞き直せば足ります。",
  "",
];

for (const row of rows) {
  const mark = row.flagged ? " ⚠️ 要判定" : "";
  const score = row.agreement === null ? "-" : row.agreement.toFixed(2);
  lines.push(`## ${timestamp(row.start)}〜${timestamp(row.end)}　${markdown(row.speaker || "話者不明")}（一致度 ${score}）${mark}`);
  lines.push("");
  lines.push(`- **${markdown(primary.source)}**: ${markdown(row.primary)}`);
  for (const comparison of row.comparisons) {
    lines.push(`- ${markdown(comparison.source)}: ${markdown(comparison.text || "（該当なし）")}`);
  }
  lines.push("");
}

for (const other of untimed) {
  lines.push(`## 参考：${markdown(other.source)}（時刻なし全文）`, "", markdown(other.text), "");
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Saved consensus report: ${output} (${flaggedCount}/${rows.length} flagged)`);

if (jsonOutput) {
  fs.mkdirSync(path.dirname(path.resolve(jsonOutput)), { recursive: true });
  fs.writeFileSync(jsonOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Saved consensus data: ${jsonOutput}`);
}
