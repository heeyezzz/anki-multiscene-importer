---
name: anki-multiscene-importer
description: Import complete English vocabulary notes into an AnkiConnect-accessible AI多场景完型-style model. Use when adding words with five cloze contexts, translations, and usage analyses; do not use to redesign templates or edit existing notes.
---

# Anki Multiscene Importer

Import new, complete vocabulary notes into the Anki collection available through AnkiConnect, without changing templates, styling, scheduling, or existing notes.

## Before writing

1. Read [the note schema](references/note-schema.md).
2. Confirm the user has authorized adding the requested notes. Do not infer authorization from a request to merely draft, review, or validate vocabulary.
3. Prepare a JSON file following the schema. Keep examples short, natural, and varied; each sentence must include one `{{c1::...::填入对应词汇}}` cloze. The clozed form may be an inflection or a phrase. Use short Chinese labels for every `Scene` field and standard abbreviations such as `n.` / `v.` / `adj.` in `PartOfSpeech`.
4. Run the importer with `--dry-run` first whenever the data was produced or transformed in the current task. Resolve every reported validation or duplicate error before a real import.

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

The JSON may optionally set `modelName`; otherwise the default is `AI多场景完型 1.0`. The script requires the requested existing model and deck; it never creates or changes either. It validates all required fields, requires a Chinese scene label for each `Scene1–5`, requires standard abbreviated parts of speech, detects existing `Word` values, calls `canAddNotes`, adds notes, and reads each note back.

If AnkiConnect is unavailable, stop and ask the user to open Anki with AnkiConnect enabled on that computer. Never add a fallback that writes collection files directly. Do not expose an AnkiConnect endpoint publicly merely to make remote agents work; use the Anki instance the executing agent is authorized to access.

## After writing

Report the imported words and note IDs. Treat script readback as persistence verification, not visual QA. When the user asks to verify rendered card behavior, inspect a card in Anki without rating it.
