// Web Worker: parse + detect + convert off the main thread.
import { extractDiagrams } from './extractor.js';

self.onmessage = (ev) => {
  const { id, name, text, promote } = ev.data;
  try {
    self.postMessage({ id, ok: true, result: extractDiagrams(text, name, { promote }) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message });
  }
};
