/** Builds the Exa `contents` request option. Centralized so every search
 * requests text extraction the same way (a single character cap), instead
 * of each call site guessing its own shape. */
export function buildContentsOption(maxCharacters = 3000): { text: { maxCharacters: number } } {
  return { text: { maxCharacters } };
}
