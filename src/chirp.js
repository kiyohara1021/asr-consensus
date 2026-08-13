"use strict";

// Google Cloud Speech-to-Text v2 の Chirp 3。
// 同期 Recognize は1分未満の音声しか受け付けないため、無音位置で分割して
// インラインで送る。GCS バケットを作らずに済ませるための設計。

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const MAX_CHUNK_SECONDS = 55;

function accessToken() {
  return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
    encoding: "utf8",
  }).trim();
}

function sliceBinary() {
  const binary = path.join(__dirname, "..", "bin", "audio-slice");
  if (!fs.existsSync(binary)) {
    throw new Error(`Audio slicer not built. Run:\n  swiftc -O -o bin/audio-slice src/apple/slice.swift`);
  }
  return binary;
}

function durationOf(input) {
  // The slicer reports the range it actually wrote, which is clamped to the file.
  const out = execFileSync(sliceBinary(), [
    "--input", input, "--output", path.join(os.tmpdir(), "probe.wav"), "--start", "0", "--end", "999999",
  ], { encoding: "utf8" });
  const match = out.match(/frames=(\d+)/);
  if (!match) throw new Error(`Could not determine duration: ${out}`);
  return Number(match[1]) / 16000;
}

// Split at the widest silences so no chunk boundary lands mid-word.
function autoSplits(duration, silences) {
  const points = [0];
  let cursor = 0;
  while (duration - cursor > MAX_CHUNK_SECONDS) {
    const candidates = silences
      .filter((s) => s.at > cursor + 15 && s.at <= cursor + MAX_CHUNK_SECONDS)
      .sort((a, b) => b.at - a.at);
    const next = candidates.length > 0 ? candidates[0].at : cursor + MAX_CHUNK_SECONDS;
    points.push(Number(next.toFixed(2)));
    cursor = next;
  }
  points.push(Number(duration.toFixed(2)));
  return points;
}

async function recognizeChunk({ file, project, location, model, language, token }) {
  const content = fs.readFileSync(file).toString("base64");
  const host = location === "global" ? "speech.googleapis.com" : `${location}-speech.googleapis.com`;
  const url = `https://${host}/v2/projects/${project}/locations/${location}/recognizers/_:recognize`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        model,
        languageCodes: [language],
        features: { enableAutomaticPunctuation: true },
      },
      content,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Cloud Speech returned ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function transcribeChirp({ input, language, project, location, model, silences }) {
  if (!project) throw new Error("--project or GOOGLE_CLOUD_PROJECT is required for chirp");
  const token = accessToken();
  const duration = durationOf(input);
  const points = autoSplits(duration, silences || []);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "chirp-"));
  const segments = [];
  let full = "";

  try {
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const file = path.join(workDir, `chunk-${i}.wav`);
      execFileSync(sliceBinary(), [
        "--input", input, "--output", file, "--start", String(start), "--end", String(end),
      ]);

      const result = await recognizeChunk({ file, project, location, model, language, token });
      let cursor = start;
      for (const item of result.results || []) {
        const alternative = (item.alternatives || [])[0];
        if (!alternative || !alternative.transcript) continue;
        const text = alternative.transcript.trim();
        if (text.length === 0) continue;
        // resultEndOffset is relative to the chunk, e.g. "12.300s".
        const offset = item.resultEndOffset ? Number(String(item.resultEndOffset).replace(/s$/, "")) : null;
        const segmentEnd = offset === null ? end : Math.min(start + offset, end);
        segments.push({
          start: Number(cursor.toFixed(2)),
          end: Number(segmentEnd.toFixed(2)),
          speaker: null,
          text,
          confidence: alternative.confidence ?? null,
        });
        cursor = segmentEnd;
        full += text;
      }
      process.stderr.write(`  chunk ${i + 1}/${points.length - 1} (${start}-${end}s) ok\n`);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  return {
    engine: "google-chirp",
    model,
    location,
    duration,
    splits: points,
    text: full,
    segments,
  };
}

module.exports = { transcribeChirp };
