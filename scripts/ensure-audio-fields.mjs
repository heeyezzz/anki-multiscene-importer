#!/usr/bin/env node

const API_URL = process.env.ANKI_CONNECT_URL || "http://127.0.0.1:8765";
const MODEL_NAME = "AI多场景完型 1.0";
const AUDIO_FIELDS = ["AudioWord", "AudioSentence1", "AudioSentence2", "AudioSentence3", "AudioSentence4", "AudioSentence5", "AudioMediaRefs"];
const apply = process.argv.slice(2).includes("--apply");

const invoke = async (action, params = {}) => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params })
  });
  if (!response.ok) throw new Error(`AnkiConnect HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`AnkiConnect ${action}: ${payload.error}`);
  return payload.result;
};

const models = await invoke("modelNames");
if (!models.includes(MODEL_NAME)) throw new Error(`Missing Anki model: ${MODEL_NAME}`);
const before = await invoke("modelFieldNames", { modelName: MODEL_NAME });
const missing = AUDIO_FIELDS.filter((field) => !before.includes(field));
if (!missing.length) {
  console.log(`${MODEL_NAME} already has all TTS fields.`);
  process.exit(0);
}
if (!apply) {
  console.log(JSON.stringify({ modelName: MODEL_NAME, missing, repairCommand: "node scripts/ensure-audio-fields.mjs --apply" }, null, 2));
  process.exit(2);
}
for (const fieldName of missing) {
  await invoke("modelFieldAdd", { modelName: MODEL_NAME, fieldName });
}
const after = await invoke("modelFieldNames", { modelName: MODEL_NAME });
if (!AUDIO_FIELDS.every((field) => after.includes(field))) throw new Error("TTS field repair readback mismatch.");
console.log(JSON.stringify({ modelName: MODEL_NAME, added: missing }, null, 2));
