/**
 * Vision support: PDF to PNG conversion, image base64 encoding.
 * For Gemma 4 vision/audio/multimodal capabilities.
 */
import { readFileSync } from 'node:fs';

export function imageToBase64(filePath) {
  const buf = readFileSync(filePath);
  return buf.toString('base64');
}

export function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

/**
 * Check if a model supports vision input.
 * Gemma 4 has full vision + audio + thinking + tools.
 */
export function supportsVision(modelName) {
  const visionModels = [
    'gemma4', 'gemma3', 'llama3.2-vision', 'llama4',
    'granite3.2-vision', 'moondream', 'gpt-oss',
  ];
  return visionModels.some(v => modelName.includes(v));
}

/**
 * Check if a model supports audio input.
 * Gemma 4 natively handles audio via multimodal input.
 */
export function supportsAudio(modelName) {
  return modelName.includes('gemma4');
}

/**
 * Check if a model supports thinking/reasoning capture.
 * Gemma 4 and gpt-oss both support streaming reasoning.
 */
export function supportsThinking(modelName) {
  return modelName.includes('gemma4') ||
         modelName.includes('gpt-oss') ||
         modelName.includes('reasoning');
}

/**
 * Check if model is a cloud variant (runs on remote Ollama cloud infra)
 */
export function isCloudModel(modelName) {
  return modelName.includes('-cloud');
}
