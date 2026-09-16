#!/usr/bin/env node
import { getMiniMaxApiKey } from "./minimax-credentials.mjs";
import { MINIMAX_TTS_ENDPOINT, createMediaFilename, stripClozeMarkup, synthesizeMiniMax } from "./minimax-tts.mjs";

const API_URL = process.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = "AI多场景完型 1.0";
const AUDIO_FIELDS = ["AudioWord", ...Array.from({ length: 5 }, (_, index) => `AudioSentence${index + 1}`)];
const AUDIO_MEDIA_REFERENCE_FIELD = "AudioMediaRefs";
const usage = "Usage: node add-audio-to-existing.mjs --deck DECK_NAME --minimax-voice VOICE_ID [--word WORD] [--minimax-model MODEL] [--minimax-speed NUMBER] [--minimax-min-interval-ms NUMBER] [--minimax-api-key-env NAME] [--minimax-keychain-service NAME] [--minimax-env-file PATH] [--minimax-endpoint URL]";
const options = process.argv.slice(2);
const config = { deckName: "", word: "", voiceId: "", model: "speech-2.8-hd", speed: 1, minIntervalMs: 11000, apiKeyEnv: "MINIMAX_API_KEY", keychainService: "anki-minimax-tts", envFile: "", endpoint: MINIMAX_TTS_ENDPOINT };
for (let index = 0; index < options.length; index += 1) {
  const option = options[index];
  const value = options[index + 1];
  if (!value || value.startsWith("--")) throw new Error(usage);
  if (option === "--deck") config.deckName = value;
  else if (option === "--word") config.word = value;
  else if (option === "--minimax-voice") config.voiceId = value;
  else if (option === "--minimax-model") config.model = value;
  else if (option === "--minimax-speed") config.speed = Number(value);
  else if (option === "--minimax-min-interval-ms") config.minIntervalMs = Number(value);
  else if (option === "--minimax-api-key-env") config.apiKeyEnv = value;
  else if (option === "--minimax-keychain-service") config.keychainService = value;
  else if (option === "--minimax-env-file") config.envFile = value;
  else if (option === "--minimax-endpoint") config.endpoint = value;
  else throw new Error(usage);
  index += 1;
}
if (!config.deckName || !config.voiceId || !Number.isFinite(config.speed) || config.speed <= 0 || !Number.isFinite(config.minIntervalMs) || config.minIntervalMs < 0) throw new Error(usage);

const invoke = async (action, params = {}) => {
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, version: 6, params }) });
  if (!response.ok) throw new Error(`AnkiConnect HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`AnkiConnect ${action}: ${payload.error}`);
  return payload.result;
};
const getContextCount = (note) => {
  let count = 0;
  let foundGap = false;
  for (let index = 1; index <= 5; index += 1) {
    const sentence = note.fields[`Sentence${index}`]?.value?.trim();
    if (!sentence) {
      foundGap = true;
      continue;
    }
    if (foundGap) throw new Error(`${note.fields.Word.value} has a non-consecutive Sentence${index}.`);
    count = index;
  }
  if (count < 3) throw new Error(`${note.fields.Word.value} must contain three to five sentences before audio can be added.`);
  return count;
};

const fields = await invoke("modelFieldNames", { modelName: MODEL_NAME });
const missing = [...AUDIO_FIELDS, AUDIO_MEDIA_REFERENCE_FIELD].filter((field) => !fields.includes(field));
if (missing.length) throw new Error(`Model is missing TTS fields: ${missing.join("、")}。请先安装支持音频字段的模板。`);
const noteIds = await invoke("findNotes", { query: `deck:\"${config.deckName.replace(/[\\"]/g, "\\$&")}\" note:\"${MODEL_NAME}\"${config.word ? ` \"${config.word.replace(/[\\"]/g, "\\$&")}"` : ""}` });
const notes = noteIds.length ? await invoke("notesInfo", { notes: noteIds }) : [];
const pending = notes.filter((note) => !note.fields.AudioWord?.value?.trim());
if (config.word && notes.length !== 1) throw new Error(`Expected exactly one ${config.word} note in ${config.deckName}, found ${notes.length}.`);
if (!pending.length) {
  console.log(`No notes in ${config.deckName} require TTS.`);
  process.exit(0);
}
let apiKey = "";
let generatedCharacters = 0;
for (const note of pending) {
  const word = note.fields.Word.value;
  const contextCount = getContextCount(note);
  const targets = [
    { field: "AudioWord", slot: "word", text: word },
    ...Array.from({ length: contextCount }, (_, index) => ({ field: `AudioSentence${index + 1}`, slot: `sentence-${index + 1}`, text: stripClozeMarkup(note.fields[`Sentence${index + 1}`].value) }))
  ];
  const updates = Object.fromEntries(AUDIO_FIELDS.map((field) => [field, note.fields[field]?.value?.trim() || ""]));
  for (const target of targets) {
    const filename = updates[target.field] || createMediaFilename({ word, slot: target.slot, text: target.text, model: config.model, voiceId: config.voiceId, speed: config.speed });
    if (!await invoke("retrieveMediaFile", { filename })) {
      apiKey ||= await getMiniMaxApiKey(config);
      const audio = await synthesizeMiniMax({ apiKey, endpoint: config.endpoint, text: target.text, model: config.model, voiceId: config.voiceId, speed: config.speed, minIntervalMs: config.minIntervalMs });
      await invoke("storeMediaFile", { filename, data: audio.audioBase64 });
      generatedCharacters += audio.usageCharacters;
    }
    updates[target.field] = filename;
  }
  updates[AUDIO_MEDIA_REFERENCE_FIELD] = targets.map((target) => `[sound:${updates[target.field]}]`).join(" ");
  await invoke("updateNoteFields", { note: { id: note.noteId, fields: updates } });
}
const verified = await invoke("notesInfo", { notes: pending.map((note) => note.noteId) });
for (const note of verified) {
  const contextCount = getContextCount(note);
  for (const field of ["AudioWord", ...Array.from({ length: contextCount }, (_, index) => `AudioSentence${index + 1}`), AUDIO_MEDIA_REFERENCE_FIELD]) {
    if (!note.fields[field]?.value) throw new Error(`Readback mismatch for ${note.fields.Word.value}.${field}`);
  }
  for (let index = contextCount + 1; index <= 5; index += 1) {
    if (note.fields[`AudioSentence${index}`]?.value) throw new Error(`Unexpected audio for empty ${note.fields.Word.value}.Sentence${index}.`);
  }
}
console.log(JSON.stringify({ deckName: config.deckName, modelName: MODEL_NAME, completed: verified.map((note) => ({ noteId: note.noteId, word: note.fields.Word.value })), newlyGeneratedCharacters: generatedCharacters }, null, 2));
