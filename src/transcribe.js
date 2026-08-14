#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    [
      "Usage:",
      "  ELEVENLABS_API_KEY=... node src/transcribe.js --provider elevenlabs --input <audio> --output <result.json>",
      "  OPENAI_API_KEY=...     node src/transcribe.js --provider openai     --input <audio> --output <result.json>",
      "                         node src/transcribe.js --provider apple      --input <audio> --output <result.json>",
      "",
      "Options:",
      "  --provider   elevenlabs | openai | apple    (default: elevenlabs)",
      "               apple runs on-device; nothing is sent off the machine",
      "  --model      provider model id              (default: scribe_v2 / gpt-4o-transcribe)",
      "  --language   ISO language code              (default: ja)",
      "  --speakers   expected speaker count         (elevenlabs only)",
      "  --keyterm    proper noun hint, repeatable   (elevenlabs: keyterms / openai: prompt)",
      "  --prompt     free-text hint                 (openai only)",
      "  --no-diarize disable speaker separation     (elevenlabs only)",
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

async function transcribeElevenLabs({ audio, filename, model, language, keyterms, speakers, diarize }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  const baseUrl = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1").replace(/\/$/, "");

  // The multipart encoding for list params is not pinned down in the public docs.
  // Repeated fields are what the API actually wants; a JSON array arrives as one
  // oversized keyword and trips the 50-character limit. Keep JSON as a fallback.
  const encodings = ["repeated", "json"];
  let lastError;

  for (const encoding of encodings) {
    const form = new FormData();
    form.append("file", new Blob([audio]), filename);
    form.append("model_id", model);
    form.append("language_code", language);
    form.append("diarize", String(diarize));
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "true");
    if (speakers) form.append("num_speakers", String(speakers));
    if (keyterms.length > 0) {
      if (encoding === "json") form.append("keyterms", JSON.stringify(keyterms));
      else for (const term of keyterms) form.append("keyterms", term);
    }

    const response = await fetch(`${baseUrl}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    const body = await response.text();
    if (response.ok) return JSON.parse(body);

    lastError = new Error(`ElevenLabs API returned ${response.status}: ${body}`);
    // Only a validation failure is worth retrying with a different list encoding.
    const retryable = response.status === 400 || response.status === 422;
    if (!retryable || keyterms.length === 0) throw lastError;
  }

  throw lastError;
}

// Apple's recognizer is a macOS framework, so it lives behind a small Swift binary.
// Nothing leaves the machine on this path.
function transcribeApple({ input, language }) {
  const { execFileSync } = require("child_process");
  const binary = path.join(__dirname, "..", "bin", "apple-transcribe");
  if (!fs.existsSync(binary)) {
    throw new Error(
      `Apple transcriber not built. Run:\n  swiftc -O -parse-as-library -o bin/apple-transcribe src/apple/transcribe.swift`
    );
  }
  const locale = language === "ja" ? "ja-JP" : language;
  const stdout = execFileSync(binary, ["--input", input, "--locale", locale], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function transcribeOpenAI({ audio, filename, model, language, prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  const form = new FormData();
  form.append("file", new Blob([audio]), filename);
  form.append("model", model);
  form.append("language", language);
  // The diarizing model needs the hint just as much as the plain one; dropping it
  // here is what made proper nouns unreliable in earlier runs.
  if (prompt) form.append("prompt", prompt);
  if (model === "gpt-4o-transcribe-diarize") {
    form.append("response_format", "diarized_json");
    form.append("chunking_strategy", "auto");
  }

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`OpenAI API returned ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function main() {
  const args = process.argv.slice(2);
  const input = valueAfter("--input", args);
  const output = valueAfter("--output", args);
  const provider = valueAfter("--provider", args) || "elevenlabs";
  const language = valueAfter("--language", args) || "ja";
  const keyterms = valuesAfter("--keyterm", args);
  const speakers = valueAfter("--speakers", args);
  const diarize = !args.includes("--no-diarize");

  if (!input || !output) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (!fs.existsSync(input)) {
    throw new Error(`Input file not found: ${input}`);
  }

  let model = valueAfter("--model", args);
  let result;

  if (provider === "chirp") {
    const { transcribeChirp } = require("./chirp");
    model = model || "chirp_3";
    // Reuse a previous timestamped result to find the silences to cut on.
    const silenceSource = valueAfter("--silences-from", args);
    let silences = [];
    if (silenceSource) {
      const raw = JSON.parse(fs.readFileSync(silenceSource, "utf8"));
      const words = (raw.words || []).filter((w) => w.type === "word");
      for (let i = 1; i < words.length; i += 1) {
        const gap = words[i].start - words[i - 1].end;
        if (gap >= 0.4) silences.push({ at: (words[i - 1].end + words[i].start) / 2, gap });
      }
    }
    result = await transcribeChirp({
      input,
      language: language === "ja" ? "ja-JP" : language,
      project: valueAfter("--project", args) || process.env.GOOGLE_CLOUD_PROJECT,
      location: valueAfter("--location", args) || "us",
      model,
      silences,
    });
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Saved transcript (${provider}:${model}): ${output}`);
    return;
  }

  if (provider === "apple") {
    model = model || "speechtranscriber";
    result = transcribeApple({ input, language });
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Saved transcript (${provider}:${model}): ${output}`);
    return;
  }

  const audio = fs.readFileSync(input);
  const filename = path.basename(input);

  if (provider === "elevenlabs") {
    model = model || "scribe_v2";
    result = await transcribeElevenLabs({ audio, filename, model, language, keyterms, speakers, diarize });
  } else if (provider === "openai") {
    model = model || "gpt-4o-transcribe";
    // Keyterms double as an OpenAI prompt so both providers get the same hints.
    const prompt = valueAfter("--prompt", args) || (keyterms.length > 0 ? `${keyterms.join("、")}。` : undefined);
    result = await transcribeOpenAI({ audio, filename, model, language, prompt });
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Saved transcript (${provider}:${model}): ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
