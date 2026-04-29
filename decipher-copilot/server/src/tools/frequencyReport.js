/**
 * Tool: frequency_report
 * Computes unigram / bigram / trigram frequencies for a corpus.
 * Tokens are space-separated sign IDs in inscription.transcription.
 */

/**
 * @param {object} db
 * @param {object} args - { corpus_id: string, n?: 1|2|3, positional?: boolean }
 * @returns {object}
 */
export function frequencyReport(db, args) {
  const { corpus_id, n = 1, positional = false } = args;
  if (!corpus_id) return { error: 'corpus_id is required' };

  try {
    const inscriptions = db.system.prepare(
      'SELECT id, transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) {
      return { corpus_id, n, count: 0, unigrams: [], bigrams: [], trigrams: [] };
    }

    // Tokenize all transcriptions
    const allTokens = []; // array of arrays (one per inscription)
    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      allTokens.push(tokens);
    }

    const result = { corpus_id, n, inscription_count: inscriptions.length };

    // Unigrams
    if (n >= 1) {
      const freq = {};
      let lineInitial = {};
      let lineFinal = {};
      for (const tokens of allTokens) {
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i];
          freq[t] = (freq[t] || 0) + 1;
          if (positional) {
            if (i === 0) lineInitial[t] = (lineInitial[t] || 0) + 1;
            if (i === tokens.length - 1) lineFinal[t] = (lineFinal[t] || 0) + 1;
          }
        }
      }
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 200)
        .map(([sign, count], idx) => ({
          rank: idx + 1,
          sign,
          count,
          ...(positional && { line_initial: lineInitial[sign] || 0, line_final: lineFinal[sign] || 0 }),
        }));
      result.unigrams = sorted;
      result.total_tokens = Object.values(freq).reduce((a, b) => a + b, 0);
      result.vocabulary_size = Object.keys(freq).length;
    }

    // Bigrams
    if (n >= 2) {
      const freq = {};
      for (const tokens of allTokens) {
        for (let i = 0; i < tokens.length - 1; i++) {
          const k = `${tokens[i]} ${tokens[i + 1]}`;
          freq[k] = (freq[k] || 0) + 1;
        }
      }
      result.bigrams = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
        .map(([pair, count], idx) => {
          const [a, b] = pair.split(' ');
          return { rank: idx + 1, a, b, count };
        });
    }

    // Trigrams
    if (n >= 3) {
      const freq = {};
      for (const tokens of allTokens) {
        for (let i = 0; i < tokens.length - 2; i++) {
          const k = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
          freq[k] = (freq[k] || 0) + 1;
        }
      }
      result.trigrams = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([triplet, count], idx) => {
          const [a, b, c] = triplet.split(' ');
          return { rank: idx + 1, a, b, c, count };
        });
    }

    return result;
  } catch (err) {
    return { error: err.message, corpus_id };
  }
}
