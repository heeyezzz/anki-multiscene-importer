# MiniMax TTS

Use only for an authorized import that needs stored Anki audio. This is an import-time operation, never a request from card-template JavaScript.

## Configuration

The scripts first check `MINIMAX_API_KEY`, then the macOS Keychain item named `anki-minimax-tts`, then `.env` in the Skill root. To use a different dotenv file, pass `--minimax-env-file /absolute/path/to/.env`. To store the key in the Keychain:

```sh
read -s "MINIMAX_KEY?MiniMax API key: "
security add-generic-password -U -a "$USER" -s "anki-minimax-tts" -w "$MINIMAX_KEY"
unset MINIMAX_KEY
```

Copy `.env.example` to `.env`, fill in `MINIMAX_API_KEY`, and keep `.env` out of Git. An environment variable remains useful for automation, but do not commit either form of the key or add it to JSON note data. The China endpoint is `https://api.minimax.cn/v1/t2a_v2` and uses Bearer authorization.

## Import command

```sh
node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json --dry-run \
  --tts minimax --minimax-voice "English_Steady_Female_1"

node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json \
  --confirmed \
  --minimax-model "speech-2.8-hd" --minimax-speed 1
```

To add audio to notes already in a deck:

```sh
node "$SKILL_DIR/scripts/add-audio-to-existing.mjs" \
  --deck "测试::AI多场景完型测试" \
  --word "quotation" \
  --minimax-voice "English_Steady_Female_1"
```

TTS is on by default with `English_Steady_Female_1`. The default model is `speech-2.8-hd`, the default speed is `1`, and a conservative 11-second interval is kept between fresh synthesis requests to avoid RPM errors. Override it only when your MiniMax quota supports a higher request rate with `--minimax-min-interval-ms NUMBER`. The default key environment variable is `MINIMAX_API_KEY`, and the default Keychain service is `anki-minimax-tts`. To use another environment-variable name or Keychain service, pass `--minimax-api-key-env NAME` or `--minimax-keychain-service NAME`. Use `--without-tts` only on an explicitly requested silent import.

The importer creates four to six audio files per new note: one for `Word` and one for each populated `Sentence` field. It checks Anki media for the deterministic filename before each synthesis. A stopped import can be run again: cached files are reused, and only missing audio is charged again. `AudioWord` and the populated sentence audio fields hold raw filenames for custom replay buttons on the answer side; the question side deliberately renders no audio to avoid revealing the target word. `AudioWordAuto` holds the matching word `[sound:...]` tag and is rendered invisibly only on the answer side, so Anki's native player autoplays the word across clients. `AudioMediaRefs` retains all generated `[sound:...]` tags for media synchronization and checks without rendering them.

Before import, run `node "$SKILL_DIR/scripts/ensure-audio-fields.mjs"`. It performs a read-only schema audit. If fields are missing, it exits with a repair command; only run that command with `--apply` after authorization, because it changes the note type.

The real import also requires `--confirmed`. Use it only after the user has reviewed and explicitly approved the word and every generated example; this confirmation gate runs before any fresh TTS request.

The importer uses synchronous T2A because each target is short. MiniMax returns hex-encoded MP3 data; the script decodes it locally and uploads it through AnkiConnect `storeMediaFile`.
