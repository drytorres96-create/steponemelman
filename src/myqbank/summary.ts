/** A preview is always a literal prefix: decimal points and units cannot disappear. */
export function explanationPreview(text: string, limit = 80): string {
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('es', { granularity: 'sentence' }).segment(text)].map(part => part.segment)
    // Older browsers show the whole paragraph instead of guessing clinical sentence boundaries.
    : [text]
  let words = 0, preview = ''
  for (const sentence of sentences) {
    const count = sentence.trim().split(/\s+/).filter(Boolean).length
    if (preview && words + count > limit) break
    preview += sentence; words += count
  }
  return preview
}
