#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const DEFAULT_API_URL = "http://127.0.0.1:8765";
const DEFAULT_MODEL_NAME = "AI多场景完型 1.0";
const PART_OF_SPEECH_PATTERN = /^(?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|det\.|aux\.|phr\.)(?: \/ (?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|det\.|aux\.|phr\.))*$/;
const REQUIRED_FIELDS = [
  "Word", "PartOfSpeech", "IPA", "Chinese",
  ...Array.from({ length: 5 }, (_, index) => index + 1).flatMap((index) => [
    `Scene${index}`, `Sentence${index}`, `Translation${index}`, `Analysis${index}`
  ])
];

const usage = "Usage: node import-vocabulary.mjs /absolute/path/to/notes.json [--dry-run] [--anki-connect-url URL]";
const [inputPath, ...options] = process.argv.slice(2);
let dryRun = false;
let configuredApiUrl = process.env.ANKI_CONNECT_URL || DEFAULT_API_URL;

if (!inputPath || inputPath.startsWith("--")) throw new Error(usage);
for (let index = 0; index < options.length; index += 1) {
  const option = options[index];
  if (option === "--dry-run") {
    dryRun = true;
  } else if (option === "--anki-connect-url") {
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${usage}\n--anki-connect-url requires a URL.`);
    configuredApiUrl = value;
    index += 1;
  } else {
    throw new Error(usage);
  }
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
input.notes.forEach((note, noteIndex) => {
  assert(note && typeof note === "object" && !Array.isArray(note), `notes[${noteIndex}] must be an object.`);
  for (const field of REQUIRED_FIELDS) {
    assert(typeof note[field] === "string" && note[field].trim(), `notes[${noteIndex}].${field} must be a non-empty string.`);
  }
  const word = normalizeWord(note.Word);
  assert(!noteWords.has(word), `Duplicate Word in input: ${note.Word}`);
  noteWords.add(word);
  assert(PART_OF_SPEECH_PATTERN.test(note.PartOfSpeech.trim()), `notes[${noteIndex}].PartOfSpeech must use abbreviations such as n., v., adj., or n. / v.; do not use full English words.`);
  for (let index = 1; index <= 5; index += 1) {
    assert(/[\u3400-\u9fff]/.test(note[`Scene${index}`]), `notes[${noteIndex}].Scene${index} must be a short Chinese scene label, not an English-only label.`);
    const clozes = note[`Sentence${index}`].match(/\{\{c1::[^{}:]+::[^{}]+\}\}/g) || [];
    assert(clozes.length === 1, `notes[${noteIndex}].Sentence${index} must contain exactly one {{c1::target::hint}} cloze.`);
  }
});

const [models, decks] = await Promise.all([invoke("modelNames"), invoke("deckNames")]);
assert(models.includes(modelName), `Missing Anki model: ${modelName}`);
assert(decks.includes(input.deckName), `Deck does not exist: ${input.deckName}`);
const modelFields = await invoke("modelFieldNames", { modelName });
const missingFields = REQUIRED_FIELDS.filter((field) => !modelFields.includes(field));
assert(!missingFields.length, `Model is missing fields: ${missingFields.join("、")}`);

const existingIds = await invoke("findNotes", { query: `note:\"${modelName.replace(/[\\"]/g, "\\$&")}\"` });
const existingNotes = existingIds.length ? await invoke("notesInfo", { notes: existingIds }) : [];
const existingWords = new Set(existingNotes.map((note) => normalizeWord(note.fields.Word.value)));
const duplicates = input.notes.map((note) => note.Word).filter((word) => existingWords.has(normalizeWord(word)));
assert(!duplicates.length, `Words already exist in ${modelName}: ${duplicates.join("、")}`);

const ankiNotes = input.notes.map((fields) => ({
  deckName: input.deckName,
  modelName,
  fields: Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, fields[field].trim()])),
  tags: ["多场景完型"]
}));
const canAdd = await invoke("canAddNotes", { notes: ankiNotes });
assert(canAdd.every(Boolean), "AnkiConnect rejected one or more notes during canAddNotes.");

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, ankiConnectUrl: apiUrl, modelName, deckName: input.deckName, words: input.notes.map((note) => note.Word) }, null, 2));
  process.exit(0);
}

const noteIds = await invoke("addNotes", { notes: ankiNotes });
assert(noteIds.every(Boolean), "AnkiConnect returned an incomplete addNotes result; no automatic rollback was attempted.");
const readback = await invoke("notesInfo", { notes: noteIds });
for (const [index, note] of readback.entries()) {
  for (const field of REQUIRED_FIELDS) {
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
