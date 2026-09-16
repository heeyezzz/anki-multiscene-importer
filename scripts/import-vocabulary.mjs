#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  MINIMAX_TTS_ENDPOINT,
  createMediaFilename,
  stripClozeMarkup,
  synthesizeMiniMax
} from "./minimax-tts.mjs";
import { getMiniMaxApiKey } from "./minimax-credentials.mjs";

const DEFAULT_API_URL = "http://127.0.0.1:8765";
const DEFAULT_MODEL_NAME = "AI多场景完型 1.0";
const PART_OF_SPEECH_PATTERN = /^(?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|det\.|aux\.|phr\.)(?: \/ (?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|det\.|aux\.|phr\.))*$/;
const BASE_REQUIRED_FIELDS = ["Word", "PartOfSpeech", "IPA", "Chinese"];
const CONTEXT_FIELDS = (index) => [
  `Scene${index}`, `Sentence${index}`, `Translation${index}`, `Analysis${index}`
];
const ALL_NOTE_FIELDS = [
  ...BASE_REQUIRED_FIELDS,
  ...Array.from({ length: 5 }, (_, index) => CONTEXT_FIELDS(index + 1)).flat()
];
const AUDIO_FIELDS = ["AudioWord", ...Array.from({ length: 5 }, (_, index) => `AudioSentence${index + 1}`)];
const AUDIO_AUTOPLAY_FIELD = "AudioWordAuto";
const AUDIO_MEDIA_REFERENCE_FIELD = "AudioMediaRefs";
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const isFilledString = (value) => typeof value === "string" && value.trim();
const getContextCount = (note, noteIndex) => {
  let count = 0;
  let foundGap = false;
  for (let index = 1; index <= 5; index += 1) {
    const fields = CONTEXT_FIELDS(index);
    const populated = fields.map((field) => isFilledString(note[field]));
    const hasAny = fields.some((field) => note[field] !== undefined && note[field] !== null && String(note[field]).trim());
    if (!hasAny) {
      foundGap = true;
      continue;
    }
    assert(populated.every(Boolean), `notes[${noteIndex}] context ${index} must provide Scene, Sentence, Translation, and Analysis together.`);
    assert(!foundGap, `notes[${noteIndex}] contexts must be consecutive; context ${index} cannot follow an empty context.`);
    count = index;
  }
  assert(count >= 3, `notes[${noteIndex}] must provide three to five complete contexts.`);
  return count;
};

const usage = "Usage: node import-vocabulary.mjs /absolute/path/to/notes.json [--dry-run] [--without-tts] [--anki-connect-url URL] [--tts minimax --minimax-voice VOICE_ID] [--minimax-model MODEL] [--minimax-speed NUMBER] [--minimax-min-interval-ms NUMBER] [--minimax-api-key-env NAME] [--minimax-keychain-service NAME] [--minimax-env-file PATH] [--minimax-endpoint URL]";
const [inputPath, ...options] = process.argv.slice(2);
let dryRun = false;
let configuredApiUrl = process.env.ANKI_CONNECT_URL || DEFAULT_API_URL;
const tts = {
  enabled: true,
  provider: "minimax",
  voiceId: "English_Steady_Female_1",
  model: "speech-2.8-hd",
  speed: 1,
  minIntervalMs: 11000,
  apiKeyEnv: "MINIMAX_API_KEY",
  keychainService: "anki-minimax-tts",
  envFile: "",
  endpoint: MINIMAX_TTS_ENDPOINT
};

if (!inputPath || inputPath.startsWith("--")) throw new Error(usage);
for (let index = 0; index < options.length; index += 1) {
  const option = options[index];
  if (option === "--dry-run") {
    dryRun = true;
  } else if (option === "--without-tts") {
    tts.enabled = false;
  } else if (option === "--anki-connect-url") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--anki-connect-url requires a URL.`);
    configuredApiUrl = value;
    index += 1;
  } else if (option === "--tts") {
    const value = options[index + 1];
    if (value !== "minimax") throw new Error(`${usage}\n--tts currently supports only minimax.`);
    tts.provider = value;
    tts.enabled = true;
    index += 1;
  } else if (option === "--minimax-voice") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-voice requires a voice ID.`);
    tts.voiceId = value;
    index += 1;
  } else if (option === "--minimax-model") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-model requires a model name.`);
    tts.model = value;
    index += 1;
  } else if (option === "--minimax-speed") {
    const value = Number(options[index + 1]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${usage}\n--minimax-speed requires a positive number.`);
    tts.speed = value;
    index += 1;
  } else if (option === "--minimax-min-interval-ms") {
    const value = Number(options[index + 1]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${usage}\n--minimax-min-interval-ms requires a non-negative number.`);
    tts.minIntervalMs = value;
    index += 1;
  } else if (option === "--minimax-api-key-env") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-api-key-env requires an environment-variable name.`);
    tts.apiKeyEnv = value;
    index += 1;
  } else if (option === "--minimax-keychain-service") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-keychain-service requires a service name.`);
    tts.keychainService = value;
    index += 1;
  } else if (option === "--minimax-env-file") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-env-file requires a file path.`);
    tts.envFile = value;
    index += 1;
  } else if (option === "--minimax-endpoint") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--minimax-endpoint requires a URL.`);
    tts.endpoint = value;
    index += 1;
  } else {
    throw new Error(usage);
  }
}

if (tts.enabled) {
  assert(tts.voiceId, "MiniMax TTS requires --minimax-voice VOICE_ID.");
}

let apiUrl;
try {
  apiUrl = new URL(configuredApiUrl).toString().replace(/\/$/, "");
} catch (_) {
  throw new Error(`Invalid AnkiConnect URL: ${configuredApiUrl}`);
}

const invoke = async (action, params = {}) => {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params })
  });
  if (!response.ok) throw new Error(`AnkiConnect HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`AnkiConnect ${action}: ${payload.error}`);
  return payload.result;
};

const normalizeWord = (value) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

const raw = await readFile(inputPath, "utf8");
let input;
try {
  input = JSON.parse(raw);
} catch (_) {
  throw new Error("Input must be valid JSON.");
}

assert(input && typeof input === "object" && !Array.isArray(input), "Input must be a JSON object.");
const modelName = input.modelName ?? DEFAULT_MODEL_NAME;
assert(typeof modelName === "string" && modelName.trim(), "modelName must be a non-empty string when provided.");
assert(typeof input.deckName === "string" && input.deckName.trim(), "deckName must be a non-empty string.");
assert(Array.isArray(input.notes) && input.notes.length, "notes must be a non-empty array.");

const noteWords = new Set();
const contextCounts = input.notes.map((note, noteIndex) => {
  assert(note && typeof note === "object" && !Array.isArray(note), `notes[${noteIndex}] must be an object.`);
  for (const field of BASE_REQUIRED_FIELDS) {
    assert(typeof note[field] === "string" && note[field].trim(), `notes[${noteIndex}].${field} must be a non-empty string.`);
  }
  const contextCount = getContextCount(note, noteIndex);
  const word = normalizeWord(note.Word);
  assert(!noteWords.has(word), `Duplicate Word in input: ${note.Word}`);
  noteWords.add(word);
  assert(PART_OF_SPEECH_PATTERN.test(note.PartOfSpeech.trim()), `notes[${noteIndex}].PartOfSpeech must use abbreviations such as n., v., adj., or n. / v.; do not use full English words.`);
  for (let index = 1; index <= contextCount; index += 1) {
    assert(/[\u3400-\u9fff]/.test(note[`Scene${index}`]), `notes[${noteIndex}].Scene${index} must be a short Chinese scene label, not an English-only label.`);
    const clozes = note[`Sentence${index}`].match(/\{\{c1::[^{}:]+::[^{}]+\}\}/g) || [];
    assert(clozes.length === 1, `notes[${noteIndex}].Sentence${index} must contain exactly one {{c1::target::hint}} cloze.`);
  }
  return contextCount;
});

const [models, decks] = await Promise.all([invoke("modelNames"), invoke("deckNames")]);
assert(models.includes(modelName), `Missing Anki model: ${modelName}`);
assert(decks.includes(input.deckName), `Deck does not exist: ${input.deckName}`);
const modelFields = await invoke("modelFieldNames", { modelName });
const missingFields = ALL_NOTE_FIELDS.filter((field) => !modelFields.includes(field));
assert(!missingFields.length, `Model is missing fields: ${missingFields.join("、")}`);
if (tts.enabled) {
  const missingAudioFields = [...AUDIO_FIELDS, AUDIO_AUTOPLAY_FIELD, AUDIO_MEDIA_REFERENCE_FIELD].filter((field) => !modelFields.includes(field));
  assert(!missingAudioFields.length, `Model is missing TTS fields: ${missingAudioFields.join("、")}。请先运行 scripts/ensure-audio-fields.mjs 检查并在获得授权后用 --apply 修复。`);
}

const existingIds = await invoke("findNotes", { query: `note:\"${modelName.replace(/[\\"]/g, "\\$&")}\"` });
const existingNotes = existingIds.length ? await invoke("notesInfo", { notes: existingIds }) : [];
const existingWords = new Set(existingNotes.map((note) => normalizeWord(note.fields.Word.value)));
const duplicates = input.notes.map((note) => note.Word).filter((word) => existingWords.has(normalizeWord(word)));
assert(!duplicates.length, `Words already exist in ${modelName}: ${duplicates.join("、")}`);

const ankiNotes = input.notes.map((fields) => ({
  deckName: input.deckName,
  modelName,
  fields: Object.fromEntries(ALL_NOTE_FIELDS.map((field) => [field, typeof fields[field] === "string" ? fields[field].trim() : ""])),
  tags: ["多场景完型"]
}));
const canAdd = await invoke("canAddNotes", { notes: ankiNotes });
assert(canAdd.every(Boolean), "AnkiConnect rejected one or more notes during canAddNotes.");

if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    ankiConnectUrl: apiUrl,
    modelName,
    deckName: input.deckName,
    words: input.notes.map((note, index) => ({ word: note.Word, contexts: contextCounts[index] })),
    tts: tts.enabled ? { provider: tts.provider, model: tts.model, voiceId: tts.voiceId, speed: tts.speed } : null
  }, null, 2));
  process.exit(0);
}

if (tts.enabled && tts.provider === "minimax") {
  const apiKey = await getMiniMaxApiKey(tts);
  let generatedCharacters = 0;
  for (const [noteIndex, note] of input.notes.entries()) {
    for (const field of [...AUDIO_FIELDS, AUDIO_AUTOPLAY_FIELD, AUDIO_MEDIA_REFERENCE_FIELD]) ankiNotes[noteIndex].fields[field] = "";
    const audioTargets = [
      { field: "AudioWord", slot: "word", text: stripClozeMarkup(note.Word) },
      ...Array.from({ length: contextCounts[noteIndex] }, (_, index) => ({
        field: `AudioSentence${index + 1}`,
        slot: `sentence-${index + 1}`,
        text: stripClozeMarkup(note[`Sentence${index + 1}`])
      }))
    ];
    for (const target of audioTargets) {
      const filename = createMediaFilename({
        word: note.Word,
        slot: target.slot,
        text: target.text,
        model: tts.model,
        voiceId: tts.voiceId,
        speed: tts.speed
      });
      const cached = await invoke("retrieveMediaFile", { filename });
      if (!cached) {
        const generated = await synthesizeMiniMax({
          apiKey,
          endpoint: tts.endpoint,
          text: target.text,
          model: tts.model,
          voiceId: tts.voiceId,
          speed: tts.speed,
          minIntervalMs: tts.minIntervalMs
        });
        await invoke("storeMediaFile", { filename, data: generated.audioBase64 });
        generatedCharacters += generated.usageCharacters;
      }
      ankiNotes[noteIndex].fields[target.field] = filename;
    }
    ankiNotes[noteIndex].fields[AUDIO_MEDIA_REFERENCE_FIELD] = audioTargets
      .map((target) => `[sound:${ankiNotes[noteIndex].fields[target.field]}]`)
      .join(" ");
    ankiNotes[noteIndex].fields[AUDIO_AUTOPLAY_FIELD] = `[sound:${ankiNotes[noteIndex].fields.AudioWord}]`;
  }
  console.log(`MiniMax TTS 已生成或复用 ${contextCounts.reduce((sum, count) => sum + count + 1, 0)} 段音频；本次新生成 ${generatedCharacters} 个字符。`);
}

const noteIds = await invoke("addNotes", { notes: ankiNotes });
assert(noteIds.every(Boolean), "AnkiConnect returned an incomplete addNotes result; no automatic rollback was attempted.");
const readback = await invoke("notesInfo", { notes: noteIds });
for (const [index, note] of readback.entries()) {
  for (const field of [...ALL_NOTE_FIELDS, ...(tts.enabled ? [...AUDIO_FIELDS, AUDIO_AUTOPLAY_FIELD, AUDIO_MEDIA_REFERENCE_FIELD] : [])]) {
    assert(note.fields[field]?.value === ankiNotes[index].fields[field], `Readback mismatch for ${ankiNotes[index].fields.Word}.${field}`);
  }
  assert(note.cards.length === 1, `Expected one cloze card for ${ankiNotes[index].fields.Word}, received ${note.cards.length}.`);
}

console.log(JSON.stringify({
  ankiConnectUrl: apiUrl,
  modelName,
  deckName: input.deckName,
  imported: readback.map((note) => ({ noteId: note.noteId, word: note.fields.Word.value, cardId: note.cards[0] }))
}, null, 2));
