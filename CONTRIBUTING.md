# Contributing

Thank you for helping improve asr-consensus. Bug reports, provider-neutral fixtures, documentation fixes, and focused pull requests are welcome.

## Before opening an issue

- Remove names, organizations, contact details, and other identifying information.
- Do not attach real recordings, raw transcripts, API responses, access tokens, or `.env` files.
- Reduce parser problems to a small synthetic JSON example where possible.

## Local development

Requires Node.js 20 or later. There are no runtime dependencies.

```bash
git clone https://github.com/kiyohara1021/asr-consensus.git
cd asr-consensus
npm test
npm run check
npm run demo
```

## Pull requests

1. Keep one problem or feature per pull request.
2. Add or update tests for behavior changes.
3. Update both `README.md` and `README.ja.md` when user-facing behavior changes.
4. Add a short entry under `Unreleased` in `CHANGELOG.md`.
5. Use only synthetic text in fixtures. State explicitly that it was not derived from a real recording.
6. Confirm `git diff --check`, `npm run check`, and `npm pack --dry-run` pass.

Provider-specific adapters should convert output to `schema/asr-result.schema.json`. Provider-specific fields belong under `metadata`; comparison logic must not depend on them.

By contributing, you agree that your contribution is licensed under the MIT License.
