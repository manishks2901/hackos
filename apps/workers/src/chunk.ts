export interface Chunk {
  section: string | null;
  content: string;
}

const MAX_CHUNK = 1500;
const OVERLAP = 150;

/**
 * Split markdown by headings; oversized sections are windowed with overlap.
 * Small enough to retrieve precisely, large enough to carry context.
 */
export function chunkMarkdown(text: string): Chunk[] {
  const lines = text.split("\n");
  const sections: Array<{ heading: string | null; body: string[] }> = [
    { heading: null, body: [] },
  ];
  for (const line of lines) {
    const m = /^(#{1,4})\s+(.*)/.exec(line);
    if (m) sections.push({ heading: m[2].trim(), body: [line] });
    else sections[sections.length - 1].body.push(line);
  }

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const body = s.body.join("\n").trim();
    if (!body) continue;
    if (body.length <= MAX_CHUNK) {
      chunks.push({ section: s.heading, content: body });
      continue;
    }
    for (let start = 0; start < body.length; start += MAX_CHUNK - OVERLAP) {
      const piece = body.slice(start, start + MAX_CHUNK).trim();
      if (piece) chunks.push({ section: s.heading, content: piece });
    }
  }
  return chunks;
}
