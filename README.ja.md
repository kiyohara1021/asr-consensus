# asr-consensus

[![CI](https://github.com/kiyohara1021/asr-consensus/actions/workflows/ci.yml/badge.svg)](https://github.com/kiyohara1021/asr-consensus/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/asr-consensus)](https://www.npmjs.com/package/asr-consensus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

複数の音声認識結果から、**食い違った区間だけを人が確認する**ためのCLI・ブラウザビューアです。

[English README](README.md)

## インストール

```bash
npm install --global asr-consensus
```

比較ライブラリは`require("asr-consensus")`からも利用できます。

`asr-consensus`は、時刻付きASR結果を同じタイムラインへ揃え、文字bigramの一致度から確認対象を絞ります。LLMに正解を決めさせません。形態素解析器を必要としないため、日本語を含むCJKテキストをそのまま比較できます。

## 特徴

- プロバイダ非依存のJSON入力
- 日本語の句読点・空白・全角半角差を正規化
- Markdown、JSON、ブラウザの3つの確認方法
- ElevenLabs、OpenAI、Whisper、Apple Speech、Google Chirp出力の任意アダプター
- 比較機能とデモは依存パッケージなし
- 自動で勝者を選ばず、最終判断を人に残す

## 音声・APIキーなしで試す

[ブラウザデモを開く](https://kiyohara1021.github.io/asr-consensus/) — 架空fixtureを使い、処理はブラウザ内だけで完了します。

```bash
git clone https://github.com/kiyohara1021/asr-consensus.git
cd asr-consensus
npm run demo
```

<http://127.0.0.1:4173> を開いてください。デモは架空テキストのfixtureだけで動きます。標準スキーマの手元のJSONを選んだ場合も、処理はブラウザ内で完結します。

CLIでも同じfixtureを試せます。

```bash
node src/consensus.js \
  --primary fixtures/primary.json \
  --other fixtures/comparison-a.json \
  --other fixtures/comparison-b.json \
  --output /tmp/asr-report.md \
  --json /tmp/asr-report.json
```

## 標準入力形式

[JSON Schema](schema/asr-result.schema.json)で定義しています。

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

`primary`は確認用タイムラインになるため、各segmentに時刻が必要です。時刻のない比較結果は参考全文として残りますが、区間ごとの比較には使われません。

CLIは既存プロバイダのJSONも自動判定・正規化します。

- ElevenLabsの単語タイムスタンプJSON
- OpenAIの通常・話者分離JSON
- Whisperのsegment JSON
- このリポジトリで生成したApple SpeechTranscriber出力
- このリポジトリで生成したGoogle Chirp出力

## CLI

```text
asr-consensus --primary result.json [--other result.json]... --output report.md

--primary    タイムラインの基準にする時刻付き結果
--other      比較結果。複数回指定可能
--output     Markdown確認レポート
--json       機械可読な整列結果（任意）
--threshold  この一致度未満を要確認にする（既定: 0.65）
```

一致度は正規化した文字bigramのDice係数です。低い値は「基準側が誤り」ではなく「ここを確認する」という意味です。

## 任意の文字起こし補助

比較だけならAPIキーは不要です。文字起こし結果を取得する補助機能も同梱しています。

| プロバイダ | 処理場所 | 認証 |
|---|---|---|
| Apple SpeechTranscriber | 端末内 | 不要 |
| ElevenLabs | クラウド | `ELEVENLABS_API_KEY` |
| OpenAI | クラウド | `OPENAI_API_KEY` |
| Google Chirp | クラウド | Google Application Default Credentials |

クラウド補助を使う場合だけ`.env.example`を`.env`へコピーしてください。`.env`、音声、実際の文字起こし、プロバイダ出力、生成レポートはコミットしないでください。Apple補助にはmacOSとSwiftバイナリのローカルビルドが必要です。

音声を外部サービスへ送る前に、話者の同意と各プロバイダの最新の保持・データ利用条件を確認してください。

## 制約

- エンジン間の一致は正解を意味しません。原音確認の代わりにはなりません。
- 複数エンジンが同じ誤りをする場合があります。
- 区間境界が大きく異なる結果は、事前調整が必要になる場合があります。
- 粗い区間は文単位に分け、文字数から推定時刻を付ける場合があります。
- 同意・法令・プロバイダ規約への適合性を自動判定するものではありません。

## 開発

Node.js 20以降が必要です。

```bash
npm test
npm run check
npm run test:coverage
```

[CONTRIBUTING.md](CONTRIBUTING.md)、[SUPPORT.md](SUPPORT.md)、[SECURITY.md](SECURITY.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)、[CHANGELOG.md](CHANGELOG.md)も参照してください。

## ライセンス

[MIT](LICENSE)
