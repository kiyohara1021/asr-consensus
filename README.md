# asr-consensus

日本語インタビュー向けの文字起こしCLIです。4つのプロバイダで文字起こしでき、Whisper系を含む5系統の出力を突き合わせて食い違いを洗い出す合議機能を備えています。APIキーや音声ファイルはプロジェクトに保存しません。

単一エンジンの精度には限界があるため、このツールは**系統の異なる複数エンジンを並べ、食い違った箇所だけを絞り込んで判定する**ことに主眼を置いています。判定の手順は「聞き取り不明箇所の判定手法」を参照してください。

## 対応エンジン

| provider | エンジン | 外部送信 | 特徴 |
|---|---|---|---|
| `elevenlabs` | Scribe v2 | あり | 日本語精度・話者分離とも最良。キーターム指定可。既定 |
| `chirp` | Google Chirp 3 | あり | 相づちの分離が良い。語の反復癖あり、固有名詞は崩れやすい |
| `apple` | SpeechTranscriber | **なし** | on-device。3分48秒を2.7秒で処理。雑音区間は脱落する |
| `openai` | gpt-4o-transcribe | あり | 実行ごとに全長を返さないことがあるため要検証 |

Whisper（mlx-whisper 等）の出力 JSON も合議のソースとして読み込めます。

## 必要なもの

- Node.js 20以降
- 使うプロバイダの認証情報（`.env` に記載）
  - ElevenLabs: `ELEVENLABS_API_KEY`（Restricted + Speech to Text のみで可）
  - OpenAI: `OPENAI_API_KEY`
  - Chirp: `gcloud auth application-default login` 済み、対象プロジェクトで `speech.googleapis.com` を有効化
- `apple` / `chirp` を使う場合は Swift バイナリのビルド（下記）

```bash
swiftc -O -parse-as-library -o bin/apple-transcribe src/apple/transcribe.swift
swiftc -O -o bin/audio-slice src/apple/slice.swift
```

## 1. 文字起こし

```bash
set -a && . ./.env && set +a
node src/transcribe.js \
  --provider elevenlabs \
  --input '/path/to/audio.mp3' \
  --output './scribe.json' \
  --language ja \
  --speakers 2 \
  --keyterm 'おやつとやまねこ' --keyterm '尾道' --keyterm '神石高原町'
```

`--keyterm` は固有名詞を認識に効かせるヒントで、繰り返し指定できます（Scribe v2 は最大1000語・各50文字まで）。**認識精度に最も効くオプション**です。keyterm 使用時は課金が2〜3割増しになります。

外部送信なしで回すなら `apple`、Google なら `chirp` を指定します。

```bash
node src/transcribe.js --provider apple --input audio.mp3 --output ./apple.json
node src/transcribe.js --provider chirp --input audio.mp3 --output ./chirp.json \
  --project YOUR_PROJECT --location us --silences-from ./scribe.json
```

Chirp は1分超の音声を同期 API で扱えないため、無音位置で55秒未満に分割して送ります。`--silences-from` に単語タイムスタンプを持つ結果（Scribe の出力）を渡すと、発話の切れ目で分割できます。GCS バケットは不要です。全長を一括処理したい場合は `BatchRecognize`（GCS 経由）を使ってください。

## 2. 合議（複数エンジンの突き合わせ）

```bash
node src/consensus.js \
  --primary ./scribe.json \
  --other ./chirp.json --other ./apple.json --other ./whisper.json \
  --output ./report.md
```

一致度がしきい値（既定 0.65）未満のセグメントに `⚠️ 要判定` が付きます。`--primary` にはタイムスタンプ付きの結果を指定してください。時刻を持たない結果はレポート末尾に参考全文として載ります。チャンク単位の粗い結果（Chirp など）は文単位に分割し、文字数按分で時刻を推定した上で「※時刻は推定」と明示します。

## 3. 読みやすいテキストにする

```bash
node src/render.js --input ./scribe.json --output ./transcript.txt \
  --speaker 'speaker_0=インタビュアー' --speaker 'speaker_1=インタビュイー'
```

## 聞き取り不明箇所の判定手法

候補語の仮説があるとき、Scribe の `--keyterm` に指定して再実行し、次の2点で採否を決めます。**指定すれば必ずその語が出るわけではない**ため、出力の有無だけでは判断できません。

1. **logprob の跳ね上がり** — 無指定時に低確信だった箇所が -0.00 付近まで上がるか
2. **タイムスタンプの整合性** — 音を説明できていないと、語が数ミリ秒に潰れるか1〜2秒に引き伸ばされます。前後と比べてモーラあたりの長さが自然かを見ます

**同じ箇所の出力が指定条件によって入れ替わる場合は判定不能**です。無理に選ばず、不鮮明として残してください。

## 精度を上げるための補足

- **`--keyterm` を惜しまず入れる**：固有名詞の誤変換はこれで大きく減ります。
- **話者数を `--speakers` で固定する**：2人の対話と分かっているなら指定した方が分離が安定します。
- **系統の違うエンジンを混ぜる**：合議で効くのは個々の精度より誤りの非相関性です。Whisper 派生を増やしても同じ間違いをします。
- **エンジンの脱落も情報**：Apple や Chirp が特定区間を落としたら、その区間の音声が劣化している証拠になります。
- OpenAI の `gpt-4o-transcribe-diarize` は、店内雑音のある日本語音源で言語判定に失敗して英語混じりの出力になることがあります。話者分離が必要なら Scribe v2 を推奨します。

## データの扱い

`apple` 以外は音声が外部に送信されます。インタビュー音源など第三者の声を含む場合は、話者の同意と各社の保持ポリシー（ElevenLabs の zero-retention mode、OpenAI の ZDR など）を確認してください。Chirp を `BatchRecognize` で使う場合は音声を GCS に置く必要があるため、処理後の削除を忘れないでください。
