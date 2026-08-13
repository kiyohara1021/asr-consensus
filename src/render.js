#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { normalize } = require("./normalize");

function usage() {
  console.error(
    "Usage: node src/render.js --input <result.json> --output <transcript.txt> [--speaker speaker_0=インタビュアー]"
  );
}

function valueAfter(flag, args) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function timestamp(seconds) {
  const rounded = Math.floor(Number(seconds) || 0);
  const minutes = String(Math.floor(rounded / 60)).padStart(2, "0");
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function speakerMap(args) {
  const map = new Map();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== "--speaker") continue;
    const entry = args[i + 1] || "";
    const separator = entry.indexOf("=");
    if (separator > 0) map.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  return map;
}

const args = process.argv.slice(2);
const input = valueAfter("--input", args);
const output = valueAfter("--output", args);
if (!input || !output) {
  usage();
  process.exit(2);
}

const result = normalize(JSON.parse(fs.readFileSync(input, "utf8")), path.basename(input, ".json"));
const names = speakerMap(args);
const lines = [`文字起こし（${result.source}）`, ""];

if (result.segments.length === 0) {
  lines.push(result.text);
} else {
  for (const segment of result.segments) {
    const speaker = names.get(segment.speaker) || segment.speaker || "話者";
    const time = segment.start === null ? "" : `${timestamp(segment.start)}〜${timestamp(segment.end)}　`;
    lines.push(`${time}${speaker}：${segment.text}`);
  }
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Saved readable transcript: ${output}`);
