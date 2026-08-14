# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Provider-independent ASR result schema.
- Shared comparison core for Node.js and the browser.
- API-key-free browser demo with synthetic fixtures.
- Unit and CLI integration tests.
- CI across supported Node.js release lines.
- English and Japanese project documentation.

### Changed

- Comparison is now the primary product surface; transcription integrations are optional helpers.
- JSON output now includes a schema version and untimed reference sources.
- Markdown output escapes transcript content before rendering.

### Security

- Expanded ignore rules for common audio and video formats.
- Added schema validation for local JSON input.
