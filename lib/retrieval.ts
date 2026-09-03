export type ReferenceDocument = {
  id: string;
  fileName: string;
  kind: 'resume' | 'job-description' | 'other';
  extractedText: string | null;
};

export type ReferenceSource = {
  id: string;
  documentId: string;
  label: string;
  kind: ReferenceDocument['kind'];
  content: string;
  score: number;
};

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'did', 'do', 'for', 'from', 'had', 'has',
  'have', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'that', 'the', 'their',
  'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
]);

function tokens(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]{1,}/gu) ?? [])]
    .filter((token) => !stopWords.has(token));
}

function chunks(value: string, size = 1_400, overlap = 180): string[] {
  const normalized = value.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  const result: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + size);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf('\n\n', end);
      const sentence = normalized.lastIndexOf('. ', end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > cursor + Math.floor(size * 0.6)) end = boundary + (boundary === sentence ? 1 : 0);
    }
    result.push(normalized.slice(cursor, end).trim());
    if (end >= normalized.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return result.filter(Boolean);
}

export function selectRelevantSources(question: string, documents: ReferenceDocument[], limit = 6): ReferenceSource[] {
  const query = tokens(question);
  const candidates = documents.flatMap((document) => chunks(document.extractedText ?? '').map((content, index) => {
    const haystack = new Set(tokens(`${document.fileName} ${content}`));
    const overlap = query.reduce((score, token) => score + (haystack.has(token) ? (token.length > 7 ? 3 : 2) : 0), 0);
    const kindBoost = document.kind === 'job-description' ? 0.35 : document.kind === 'resume' ? 0.2 : 0.1;
    return {
      id: `${document.id}#${index}`,
      documentId: document.id,
      label: document.fileName,
      kind: document.kind,
      content,
      score: overlap + kindBoost - index * 0.002,
    } satisfies ReferenceSource;
  }));

  const selected: ReferenceSource[] = [];
  const perDocument = new Map<string, number>();
  for (const source of candidates.sort((left, right) => right.score - left.score)) {
    if ((perDocument.get(source.documentId) ?? 0) >= 2) continue;
    selected.push(source);
    perDocument.set(source.documentId, (perDocument.get(source.documentId) ?? 0) + 1);
    if (selected.length === limit) break;
  }
  return selected;
}
