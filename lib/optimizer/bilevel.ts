/** Pure black/white detection. Kept free of pdf-lib so hot, eagerly-loaded
 *  modules (memoryManager) can use it without pulling pdf-lib into the shell bundle. */
export function isBilevelRgba(data: Uint8ClampedArray): boolean {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    if ((r !== 0 && r !== 255) || data[i + 1] !== r || data[i + 2] !== r) return false;
  }
  return true;
}
