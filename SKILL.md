---
name: anki-multiscene-importer
description: Import complete English vocabulary notes into an AnkiConnect-accessible AI多场景完型-style model. Use when adding words with three to five cloze contexts, translations, and usage analyses; do not use to redesign templates or edit existing notes.
---

# Anki Multiscene Importer

Import new, complete vocabulary notes into the Anki collection available through AnkiConnect, without changing templates, styling, scheduling, or existing notes.

## Before writing

1. Read [the note schema](references/note-schema.md).
2. Confirm the user has authorized adding the requested notes. Do not infer authorization from a request to merely draft, review, or validate vocabulary.
3. Read [the example-design guide](references/example-design.md), then prepare a JSON file following the schema. Create three to five distinct retrieval conditions, not cosmetic rewrites of one sentence. Each sentence must include one `{{c1::...::填入对应词汇}}` cloze. The clozed form may be an inflection or a phrase. Use short Chinese labels for every populated `Scene` field and standard abbreviations such as `n.` / `v.` / `adj.` in `PartOfSpeech`.
4. Run `node "$SKILL_DIR/scripts/ensure-audio-fields.mjs"` first. If it reports missing fields, stop and obtain authorization before running the shown `--apply` repair command.
5. Run the importer with `--dry-run` first whenever the data was produced or transformed in the current task. Resolve every reported validation or duplicate error before a real import.

## Import

Set `SKILL_DIR` to the directory containing this `SKILL.md`, then run:

```sh
SKILL_DIR="/path/to/installed/anki-multiscene-importer"
node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json --dry-run
node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json
```

By default the script connects to AnkiConnect at `http://127.0.0.1:8765`, so each computer imports into its own open Anki desktop app. If a computer uses a different local endpoint, configure it with either an environment variable or a command option:

```sh
ANKI_CONNECT_URL="http://127.0.0.1:8765" node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json --dry-run
node "$SKILL_DIR/scripts/import-vocabulary.mjs" /absolute/path/to/notes.json --dry-run --anki-connect-url "http://127.0.0.1:8765"
```

The JSON may optionally set `modelName`; otherwise the default is `AI多场景完型 1.0`. The script requires the requested existing model and deck; it never creates or changes either. It validates three to five consecutive context groups, requires a Chinese scene label for each populated `Scene`, requires standard abbreviated parts of speech, detects existing `Word` values, calls `canAddNotes`, adds notes, and reads each note back.

## Required MiniMax audio

This configured workflow generates MiniMax audio by default: `speech-2.8-hd`, `English_Steady_Female_1`, speed `1`. Before a real import, state that it will make one word request plus one request per populated example—four to six paid TTS requests per uncached note—and confirm that the user has authorized the import with audio. Read [the MiniMax audio guide](references/minimax-tts.md) before running it. The API key may be supplied through an environment variable, the executing Mac's Keychain, or a local `.env`; never put it in note JSON, card templates, Git, or chat.

The importer generates one word MP3 plus one MP3 for each populated sentence, stores them in the local Anki media collection, and writes their raw filenames into the corresponding audio fields. It also writes `[sound:word-file.mp3]` into `AudioWordAuto`, which the standard back template renders invisibly for Anki's native, cross-platform answer-side autoplay. The question side has no audio. `AudioMediaRefs` retains sound tags for every generated file without rendering them. It uses deterministic names based on the source text, model, voice, and speed; already present media is reused without another MiniMax request.

To add TTS to existing notes in a deck, use `scripts/add-audio-to-existing.mjs`. It skips notes that already have `AudioWord`, so it does not overwrite existing audio. Pass `--word WORD` to repair one specific note instead of the whole deck.

Use `--without-tts` only when the user explicitly asks to create a card without audio. Without that explicit option, a missing TTS field or API key is an import-blocking error rather than permission to create a silent card.

If AnkiConnect is unavailable, stop and ask the user to open Anki with AnkiConnect enabled on that computer. Never add a fallback that writes collection files directly. Do not expose an AnkiConnect endpoint publicly merely to make remote agents work; use the Anki instance the executing agent is authorized to access.

## After writing

Report the imported words and note IDs. Treat script readback as persistence verification, not visual QA. When the user asks to verify rendered card behavior, inspect a card in Anki without rating it.
