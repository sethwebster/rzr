const KEY_BYTES = new Map([
  ["Enter", "\r"],
  ["Tab", "\t"],
  ["Escape", "\u001b"],
  ["Backspace", "\u007f"],
  ["Up", "\u001b[A"],
  ["Down", "\u001b[B"],
  ["Right", "\u001b[C"],
  ["Left", "\u001b[D"],
  ["C-c", "\u0003"],
  ["C-d", "\u0004"],
]);

export function encodeTerminalKey(key) {
  return KEY_BYTES.get(String(key)) ?? null;
}
