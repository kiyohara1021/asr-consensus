"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, detect } = require("../src/normalize");

test("preserves the provider-independent canonical format", () => {
  const raw = {
    schemaVersion: "1.0",
    source: "local-engine",
    duration: 2,
    text: "テストです。",
    segments: [{ start: 0, end: 2, speaker: null, text: "テストです。" }],
  };
  assert.equal(detect(raw), "canonical");
  assert.equal(normalize(raw).source, "local-engine");
  assert.equal(normalize(raw, "filename").source, "local-engine");
});

test("normalizes ElevenLabs word output", () => {
  const result = normalize({
    audio_duration_secs: 2,
    text: "こんにちは。",
    words: [
      { type: "word", start: 0, end: 0.8, speaker_id: "speaker_0", text: "こんにちは" },
      { type: "punctuation", start: 0.8, end: 1, speaker_id: "speaker_0", text: "。" },
    ],
  }, "elevenlabs-test");
  assert.equal(result.schemaVersion, "1.0");
  assert.equal(result.segments[0].text, "こんにちは。");
  assert.equal(result.metadata.format, "elevenlabs");
});

test("normalizes OpenAI diarized segments", () => {
  const result = normalize({
    duration: 3,
    text: "確認します。",
    segments: [{ start: 0, end: 3, speaker: "A", text: " 確認します。 " }],
    usage: { seconds: 3 },
  }, "openai-test");
  assert.equal(result.segments[0].speaker, "A");
  assert.equal(result.segments[0].text, "確認します。");
});

test("normalizes Whisper segments", () => {
  const result = normalize({
    task: "transcribe",
    text: "確認します。",
    segments: [{ seek: 0, start: 0, end: 3, text: "確認します。" }],
  }, "whisper-test");
  assert.equal(result.duration, 3);
  assert.equal(result.metadata.format, "whisper");
});

test("splits coarse on-device segments and marks estimated timings", () => {
  const result = normalize({
    engine: "apple-speechtranscriber",
    duration: 30,
    text: "一文目です。二文目です。",
    segments: [{ start: 0, end: 30, text: "一文目です。二文目です。" }],
  }, "apple-test");
  assert.equal(result.segments.length, 2);
  assert.equal(result.approximateTimings, true);
});

test("rejects invalid canonical input instead of guessing a provider", () => {
  assert.throws(() => normalize({ schemaVersion: "1.0", source: "x", segments: [{ text: "x" }] }), /invalid/);
});
