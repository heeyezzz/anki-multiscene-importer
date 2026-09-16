import { createHash } from "node:crypto";

export const MINIMAX_TTS_ENDPOINT = "https://api.minimax.cn/v1/t2a_v2";
let lastSynthesisAt = 0;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const stripClozeMarkup = (value) => String(value || "")
  .replace(/\{\{c\d+::([^}:]+)(?:::[^}]*)?\}\}/g, "$1")
  .replace(/<[^>]*>/g, "")
  .replace(/\s+/g, " ")
  .trim();

export const createMediaFilename = ({ word, slot, text, model, voiceId, speed }) => {
  const slug = String(word || "word")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase("en-US") || "word";
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ text, model, voiceId, speed }))
    .digest("hex")
    .slice(0, 16);
  return `minimax-${slug}-${slot}-${fingerprint}.mp3`;
};

export const buildTtsRequest = ({ text, model, voiceId, speed }) => ({
  model,
  text,
  stream: false,
  language_boost: "English",
  voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0 },
  audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
  subtitle_enable: false
});

export async function synthesizeMiniMax({ apiKey, endpoint = MINIMAX_TTS_ENDPOINT, text, model, voiceId, speed = 1, minIntervalMs = 11000, maxRateLimitRetries = 5 }) {
  if (!apiKey) throw new Error("MiniMax API key is required.");
  if (!text) throw new Error("MiniMax TTS text must not be empty.");
  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
    const waitFor = Math.max(0, minIntervalMs - (Date.now() - lastSynthesisAt));
    if (waitFor) await pause(waitFor);
    lastSynthesisAt = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildTtsRequest({ text, model, voiceId, speed }))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.base_resp?.status_code) {
      const reason = payload.base_resp?.status_msg || payload.message || `HTTP ${response.status}`;
      if (/rate limit/i.test(reason) && attempt < maxRateLimitRetries) continue;
      throw new Error(`MiniMax TTS failed: ${reason}`);
    }
    const hexAudio = payload.data?.audio;
    if (typeof hexAudio !== "string" || !/^[a-f\d]+$/i.test(hexAudio) || hexAudio.length % 2) {
      throw new Error("MiniMax TTS returned no valid MP3 audio.");
    }
    return {
      audioBase64: Buffer.from(hexAudio, "hex").toString("base64"),
      usageCharacters: payload.extra_info?.usage_characters ?? text.length
    };
  }
  throw new Error("MiniMax TTS exceeded its rate-limit retry budget.");
}
