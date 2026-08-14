# Security Policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/kiyohara1021/asr-consensus/security/advisories/new) instead of a public issue. Include the affected version, reproduction steps, and likely impact. Do not include API keys, recordings, or identifiable transcript content.

You should receive an acknowledgement within seven days. A fix and disclosure timeline will be coordinated after the report is reproduced.

## Data safety

The comparison CLI and browser demo read transcript JSON locally and do not make network requests. The optional ElevenLabs, OpenAI, and Google Chirp transcription helpers send audio to their respective services. Apple SpeechTranscriber runs on-device.

- Keep credentials in environment variables or an ignored `.env` file.
- Grant provider credentials the minimum required scope.
- Never commit audio, raw transcripts, provider output, generated reports, or credentials.
- Obtain speaker consent and review provider retention terms before uploading audio.
- Treat generated Markdown and JSON reports as sensitive when the input is sensitive.

Supported versions are the latest released version and the current `main` branch.
