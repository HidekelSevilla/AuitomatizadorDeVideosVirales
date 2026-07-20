// Reparte un total de palabras en bloques equilibrados dentro de min..max cuando es posible.
// Ejemplos del preset ingles: 9 -> 3+3+3; 11 -> 4+4+3; 5 -> 3+2 (remanente inevitable).
export function balancedCaptionGroupSizes(wordCount, maxWords, minWords = 1) {
  const total = Math.max(0, Math.floor(Number(wordCount) || 0));
  if (!total) return [];
  const cap = Math.max(1, Math.floor(Number(maxWords) || 1));
  const floor = Math.max(1, Math.min(cap, Math.floor(Number(minWords) || 1)));
  if (total <= cap) return [total];

  const groupCount = Math.ceil(total / cap);
  const base = Math.floor(total / groupCount);
  if (base >= floor) {
    return Array.from({ length: groupCount }, (_, index) => (
      base + (index < total % groupCount ? 1 : 0)
    ));
  }
  return [floor, total - floor].filter((size) => size > 0);
}
