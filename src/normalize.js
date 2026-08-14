"use strict";

const { SCHEMA_VERSION, assertResult } = require("./core");

// Every engine returns a different shape. Downstream code only ever sees:
//   { source, duration, text, segments: [{ start, end, speaker, text }] }
// start/end are null when the engine gives no timing at all.

const SEGMENT_GAP_SECONDS = 0.6;

function fromElevenLabs(raw, source) {
  const words = Array.isArray(raw.words) ? raw.words : [];
  const segments = [];
  let current = null;

  for (const word of words) {
    if (word.type === "spacing") {
      if (current) current.text += word.text ?? " ";
      continue;
    }
    const speaker = word.speaker_id || "speaker_0";
    const text = word.type === "audio_event" ? `［${word.text}］` : word.text;
    const brokenByGap = current !== null && word.start - current.end > SEGMENT_GAP_SECONDS;
    const brokenBySpeaker = current !== null && current.speaker !== speaker;

    if (current === null || brokenByGap || brokenBySpeaker) {
      current = { start: word.start, end: word.end, speaker, text };
      segments.push(current);
    } else {
      current.text += text;
      current.end = word.end;
    }
  }

  for (const segment of segments) segment.text = segment.text.trim();
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    duration: raw.audio_duration_secs ?? null,
    text: raw.text ?? segments.map((s) => s.text).join(" "),
    segments: segments.filter((s) => s.text.length > 0),
    metadata: { format: "elevenlabs" },
  };
}

function fromOpenAI(raw, source) {
  // diarized_json gives segments; plain json gives only `text`.
  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    return {
      schemaVersion: SCHEMA_VERSION,
      source,
      duration: raw.duration ?? null,
      text: raw.text ?? "",
      segments: raw.segments.map((s) => ({
        start: s.start ?? null,
        end: s.end ?? null,
        speaker: s.speaker || null,
        text: String(s.text || "").trim(),
      })).filter((s) => s.text.length > 0),
      metadata: { format: "openai" },
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    duration: raw.duration ?? null,
    text: String(raw.text || "").trim(),
    segments: [],
    metadata: { format: "openai" },
  };
}

function fromWhisper(raw, source) {
  const segments = (raw.segments || []).map((s) => ({
    start: s.start ?? null,
    end: s.end ?? null,
    speaker: null,
    text: String(s.text || "").trim(),
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    duration: segments.length > 0 ? segments[segments.length - 1].end : null,
    text: String(raw.text || segments.map((s) => s.text).join("")).trim(),
    segments: segments.filter((s) => s.text.length > 0),
    metadata: { format: "whisper" },
  };
}

// Chunk-level results (Chirp returns one block per ~50s chunk) are too coarse to
// line up against a word-timed engine. Split them on sentence boundaries and share
// the block's duration out by character count. The timings are estimates, so the
// result is flagged and the report labels the source as such.
const COARSE_SEGMENT_SECONDS = 15;

function refine(segments) {
  const out = [];
  let approximate = false;

  for (const segment of segments) {
    const span = segment.end - segment.start;
    const pieces = segment.text.split(/(?<=[。？！])/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (span <= COARSE_SEGMENT_SECONDS || pieces.length < 2) {
      out.push(segment);
      continue;
    }
    approximate = true;
    const total = pieces.reduce((sum, p) => sum + p.length, 0);
    let cursor = segment.start;
    for (const piece of pieces) {
      const end = Math.min(cursor + (span * piece.length) / total, segment.end);
      out.push({ start: Number(cursor.toFixed(2)), end: Number(end.toFixed(2)), speaker: null, text: piece });
      cursor = end;
    }
  }
  return { segments: out, approximate };
}

function fromApple(raw, source) {
  const base = (raw.segments || [])
    .map((s) => ({
      start: s.start ?? null,
      end: s.end ?? null,
      speaker: null,
      text: String(s.text || "").trim(),
    }))
    .filter((s) => s.text.length > 0);
  const timed = base.every((s) => s.start !== null && s.end !== null);
  const { segments, approximate } = timed ? refine(base) : { segments: base, approximate: false };

  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    duration: raw.duration ?? null,
    text: String(raw.text || "").trim(),
    segments,
    approximateTimings: approximate,
    metadata: { format: raw.engine || "apple" },
  };
}

function fromCanonical(raw, source) {
  const result = {
    ...raw,
    source: raw.source || source,
    text: typeof raw.text === "string" ? raw.text.trim() : raw.text,
    segments: (raw.segments || []).map((segment) => ({
      ...segment,
      text: typeof segment.text === "string" ? segment.text.trim() : segment.text,
    })),
  };
  assertResult(result);
  return result;
}

function detect(raw) {
  if (raw.schemaVersion === SCHEMA_VERSION && typeof raw.source === "string") return "canonical";
  if (raw.engine === "apple-speechtranscriber" || raw.engine === "google-chirp") return "apple";
  if (Array.isArray(raw.words) && raw.words.some((w) => w.type)) return "elevenlabs";
  if (raw.task === "transcribe" && Array.isArray(raw.segments) && raw.segments.some((s) => "seek" in s)) {
    return "whisper";
  }
  if ("usage" in raw || raw.task === "transcribe") return "openai";
  if (Array.isArray(raw.segments)) return "whisper";
  return "openai";
}

function normalize(raw, source) {
  const kind = detect(raw);
  if (kind === "canonical") return fromCanonical(raw, source);
  if (kind === "apple") return fromApple(raw, source || "apple");
  if (kind === "elevenlabs") return fromElevenLabs(raw, source || "elevenlabs");
  if (kind === "whisper") return fromWhisper(raw, source || "whisper");
  return fromOpenAI(raw, source || "openai");
}

module.exports = { normalize, detect, fromCanonical };
