# Note schema

Top-level JSON:

```json
{
  "modelName": "AI多场景完型 1.0",
  "deckName": "测试::AI多场景完型测试",
  "notes": [{ "Word": "..." }]
}
```

`modelName` is optional and defaults to `AI多场景完型 1.0`; set it when the same template was installed under a different note-type name. The AnkiConnect endpoint is configured outside this JSON with `ANKI_CONNECT_URL` or `--anki-connect-url`.

Each note must include these non-empty string fields:

```text
Word, PartOfSpeech, IPA, Chinese,
Scene1, Sentence1, Translation1, Analysis1,
Scene2, Sentence2, Translation2, Analysis2,
Scene3, Sentence3, Translation3, Analysis3
```

`Theme` is optional. Omit it or set it to `bauhaus` for the default Bauhaus visual style; set it to `minimal` for the standard visual style. No other values are accepted. The importer writes `bauhaus` when the field is omitted or empty.

`Scene4`, `Sentence4`, `Translation4`, `Analysis4` and the corresponding group 5 are optional. Include either all four fields in a group or none of them. Context groups must be consecutive: a note may contain groups 1–3, 1–4, or 1–5, but never group 5 without group 4.

When the model has audio enabled, it also contains these optional fields. Do not put values in them in the input JSON; the importer fills them only when MiniMax TTS is explicitly enabled:

```text
AudioWord, AudioSentence1, AudioSentence2, AudioSentence3, AudioSentence4, AudioSentence5, AudioWordAuto, AudioMediaRefs
```

`AudioWord` stores the raw MP3 filename for the custom replay button. `AudioWordAuto` stores the complete `[sound:filename.mp3]` reference used only by the answer template for Anki's native automatic playback. Do not supply either field in input JSON.

## Content conventions

- `PartOfSpeech` must use abbreviations: `n.`, `v.`, `adj.`, `adv.`, `prep.`, `pron.`, `conj.`, `det.`, `aux.`, or `phr.`. Multiple roles use ` / `, for example `n. / v.`. Do not use full English words such as `noun` or `verb`.
- Each populated `Scene` field must be a short Chinese scene label, for example `航运计划`、`客户通知`、`海关查验`、`仓库作业`、`到货通知`. They appear as the visual scenario Tag on both sides of the card; English-only labels are rejected.

Each populated `Sentence` field must contain exactly one target cloze in this form:

```text
{{c1::target form::填入对应词汇}}
```

The target form can differ from `Word` when the sentence needs an inflection, such as `delay` → `delayed`. Do not put HTML, sound tags, or JavaScript in import data. The importer stores supplied text as fields and does not alter card templates.

For how to design the five examples as useful variable-retrieval prompts, read [example-design.md](example-design.md).
