"use strict";

// This file intentionally uses a tiny UMD wrapper so the exact same comparison
// implementation runs in Node.js and in the dependency-free browser demo.
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AsrConsensus = api;
})(typeof globalThis === "object" ? globalThis : this, function createApi() {
  const SCHEMA_VERSION = "1.0";

  function canonical(text) {
    return String(text ?? "")
      .normalize("NFKC")
      .replace(/[\s、。，．,.!?！？「」『』（）()［］\[\]]/g, "")
      .toLowerCase();
  }

  // Dice coefficient over character bigrams works without a language-specific
  // tokenizer and is therefore predictable for Japanese and other CJK text.
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
    return (2 * hits) / (left.length + right.length - 2);
  }

  function validateResult(result) {
    const errors = [];
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return ["result must be an object"];
    }
    if (result.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be \"${SCHEMA_VERSION}\"`);
    if (typeof result.source !== "string" || result.source.trim() === "") errors.push("source must be a non-empty string");
    if (typeof result.text !== "string") errors.push("text must be a string");
    if (!Array.isArray(result.segments)) errors.push("segments must be an array");
    if (!("duration" in result) || (result.duration !== null && (!Number.isFinite(result.duration) || result.duration < 0))) {
      errors.push("duration must be null or a non-negative number");
    }
    if (Array.isArray(result.segments)) {
      result.segments.forEach((segment, index) => {
        if (!segment || typeof segment !== "object") {
          errors.push(`segments[${index}] must be an object`);
          return;
        }
        if (typeof segment.text !== "string" || segment.text.trim() === "") {
          errors.push(`segments[${index}].text must be a non-empty string`);
        }
        if (!(segment.speaker === null || typeof segment.speaker === "string")) {
          errors.push(`segments[${index}].speaker must be a string or null`);
        }
        const bothNull = segment.start === null && segment.end === null;
        const bothNumbers = Number.isFinite(segment.start) && Number.isFinite(segment.end);
        if (!bothNull && !bothNumbers) errors.push(`segments[${index}] start/end must both be numbers or both be null`);
        if (bothNumbers && (segment.start < 0 || segment.end < segment.start)) {
          errors.push(`segments[${index}] has an invalid time range`);
        }
      });
    }
    return errors;
  }

  function assertResult(result, label = "ASR result") {
    const errors = validateResult(result);
    if (errors.length > 0) throw new TypeError(`${label} is invalid:\n- ${errors.join("\n- ")}`);
    return result;
  }

  function overlappingText(segments, start, end) {
    return segments
      .filter((segment) => segment.start !== null && segment.end !== null)
      .filter((segment) => {
        const overlap = Math.min(segment.end, end) - Math.max(segment.start, start);
        const shorterSpan = Math.min(segment.end - segment.start, end - start);
        // ASR engines rarely agree on the exact boundary. Ignore a tiny edge
        // overlap so the neighbouring sentence is not pulled into this row.
        return overlap > 0 && shorterSpan > 0 && overlap / shorterSpan >= 0.25;
      })
      .map((segment) => segment.text)
      .join("")
      .trim();
  }

  function compare(primary, others, options = {}) {
    assertResult(primary, "primary");
    for (const other of others) assertResult(other, `comparison source ${other && other.source ? other.source : "(unknown)"}`);

    const threshold = options.threshold === undefined ? 0.65 : Number(options.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new RangeError("threshold must be a number between 0 and 1");
    }
    if (primary.segments.length === 0 || primary.segments.some((segment) => segment.start === null)) {
      throw new TypeError("primary must contain timestamped segments");
    }

    const timed = others.filter((result) => result.segments.some((segment) => segment.start !== null));
    const untimed = others.filter((result) => !result.segments.some((segment) => segment.start !== null));
    const rows = primary.segments.map((segment) => {
      const comparisons = timed.map((other) => {
        const text = overlappingText(other.segments, segment.start, segment.end);
        return { source: other.source, text, score: similarity(segment.text, text) };
      });
      const agreement = comparisons.length === 0 ? null : comparisons.reduce((min, item) => Math.min(min, item.score), 1);
      return {
        start: segment.start,
        end: segment.end,
        speaker: segment.speaker ?? null,
        primary: segment.text,
        comparisons,
        agreement,
        flagged: agreement !== null && agreement < threshold,
      };
    });

    return { schemaVersion: SCHEMA_VERSION, primary: primary.source, threshold, rows, untimed };
  }

  return { SCHEMA_VERSION, canonical, similarity, validateResult, assertResult, overlappingText, compare };
});
