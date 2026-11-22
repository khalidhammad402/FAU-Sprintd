/**
 * The backend serialises Python floats with json.dumps defaults, so a division by zero arrives as a bare
 * `Infinity` or `NaN`, which JSON.parse rejects (logged in docs/FRONTEND_GAPS.md). Turn them into null.
 */
const BARE = /(?<=[:[,]\s*)-?(?:Infinity|NaN)(?=\s*[,}\]])/g;

export function parseLooseJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return JSON.parse(text.replace(BARE, "null")) as T;
  }
}
