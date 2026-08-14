# asr-consensus

[![CI](https://github.com/kiyohara1021/asr-consensus/actions/workflows/ci.yml/badge.svg)](https://github.com/kiyohara1021/asr-consensus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Review only the parts where speech-to-text engines disagree.

`asr-consensus` aligns timestamped ASR results, calculates a language-independent character-bigram similarity score, and creates a small human review queue. It does **not** ask an LLM to choose a winner. Japanese and other CJK text work without a tokenizer.

[日本語README](README.ja.md)

## Why

A confidence score says how certain one engine is. Agreement tells you whether independent engines heard the same thing. This tool highlights disagreements so a reviewer can return to the audio instead of rereading an entire transcript.

- Provider-independent JSON input
- Japanese/CJK-friendly comparison without morphological analysis
- Markdown, JSON, and browser review views
- Optional adapters for ElevenLabs, OpenAI, Whisper, Apple Speech, and Google Chirp output
- Zero dependencies for comparison and demo
- No automatic “correct answer” — the final decision stays with a person

## Try it without audio or an API key

[Open the live browser demo](https://kiyohara1021.github.io/asr-consensus/) — it uses synthetic fixtures and runs entirely in your browser.

```bash
git clone https://github.com/kiyohara1021/asr-consensus.git
cd asr-consensus
npm run demo
```

Open <http://127.0.0.1:4173>. The demo uses synthetic JSON fixtures. You can also select your own standard-schema JSON files; they are processed only in your browser.

Or generate a report directly:

```bash
node src/consensus.js \
  --primary fixtures/primary.json \
  --other fixtures/comparison-a.json \
  --other fixtures/comparison-b.json \
  --output /tmp/asr-report.md \
  --json /tmp/asr-report.json
```

## Standard input format

Use the provider-independent [JSON Schema](schema/asr-result.schema.json):

```json
{
  "schemaVersion": "1.0",
  "source": "my-engine",
  "duration": 4.2,
  "text": "今日は晴れです。",
  "segments": [
    {
      "start": 0,
      "end": 4.2,
      "speaker": "speaker_0",
      "text": "今日は晴れです。"
    }
  ]
}
```

`primary` must have timestamps because it defines the review timeline. A comparison result without timestamps is preserved as reference text but cannot be aligned segment by segment.

Existing provider output is normalized automatically by the CLI. The adapter detection supports:

- ElevenLabs word-timestamp JSON
- OpenAI plain and diarized JSON
- Whisper segment JSON
- Apple SpeechTranscriber output produced by this repository
- Google Chirp output produced by this repository

## CLI

```text
asr-consensus --primary result.json [--other result.json]... --output report.md

--primary    Timestamped result used as the timeline
--other      Additional result; repeatable
--output     Markdown review report
--json       Optional machine-readable aligned report
--threshold  Similarity below this value is flagged (default: 0.65)
```

The score is a Dice coefficient over normalized character bigrams. Punctuation, spacing, case, and full-width/half-width presentation differences are ignored. A low score means “review this,” not “the primary is wrong.”

## Optional transcription helpers

Comparison never needs an API key. The repository also contains optional helpers for obtaining transcripts:

| Provider | Processing | Credential |
|---|---|---|
| Apple SpeechTranscriber | On-device | None |
| ElevenLabs | Cloud | `ELEVENLABS_API_KEY` |
| OpenAI | Cloud | `OPENAI_API_KEY` |
| Google Chirp | Cloud | Google Application Default Credentials |

Copy `.env.example` to `.env` only if you use a cloud helper. Never commit `.env`, audio, raw transcripts, provider output, or generated reports. Apple helpers require macOS and a locally built Swift binary; see comments in `.env.example` and `src/transcribe.js`.

Before sending audio to a cloud provider, obtain the speakers' consent and review that provider's current retention and data-use terms.

## Limitations

- Agreement is not ground truth and is not a substitute for listening to the source.
- Different engines can make the same error.
- Alignment is based on overlapping timestamps; very different segment boundaries may need preprocessing.
- Coarse Apple/Chirp segments may be split by sentence and assigned approximate times.
- The project does not assess transcription legality, consent, or provider compliance for you.

## Development

Requires Node.js 20 or later.

```bash
npm test
npm run check
npm run test:coverage
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
