/**
 * Tool: entropy_report
 * Computes Shannon H1, conditional H2, block entropy, Rényi entropy, and Yule's K
 * for a corpus. All metrics are computed in JS (no FFI needed for this path).
 *
 * References:
 *   Rao et al. 2009 (Indus), Tamburini 2025 (Frontiers in AI)
 */

/**
 * @param {object} db
 * @param {object} args - { corpus_id: string, kind: 'shannon'|'conditional'|'block'|'rényi'|'yule_k' }
 * @returns {object}
 */
export function entropyReport(db, args) {
  const { corpus_id, kind = 'shannon' } = args;
  if (!corpus_id) return { error: 'corpus_id is required' };

  try {
    const inscriptions = db.system.prepare(
      'SELECT transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) {
      return { corpus_id, kind, result: null, error: 'no inscriptions in corpus' };
    }

    // Tokenize
    const allTokens = [];
    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      allTokens.push(...tokens);
    }

    const N = allTokens.length;
    if (N === 0) return { corpus_id, kind, result: null, error: 'empty transcriptions' };

    // Build unigram frequency map
    const freq = {};
    for (const t of allTokens) freq[t] = (freq[t] || 0) + 1;
    const V = Object.keys(freq).length; // vocabulary size

    switch (kind) {
      case 'shannon': {
        // H1 = -sum(p * log2(p))
        let h = 0;
        for (const c of Object.values(freq)) {
          const p = c / N;
          h -= p * Math.log2(p);
        }
        return {
          corpus_id, kind,
          result: {
            h1: +h.toFixed(6),
            vocabulary: V,
            tokens: N,
            interpretation: interpretShannon(h, V),
          },
        };
      }

      case 'conditional': {
        // H2 = -sum p(a,b) * log2(p(b|a))
        // Build bigram freq
        const bifreq = {};
        for (let i = 0; i < allTokens.length - 1; i++) {
          const k = `${allTokens[i]}\x00${allTokens[i + 1]}`;
          bifreq[k] = (bifreq[k] || 0) + 1;
        }
        const M = allTokens.length - 1; // total bigrams
        let h2 = 0;
        for (const [pair, cnt] of Object.entries(bifreq)) {
          const [a] = pair.split('\x00');
          const pAB = cnt / M;
          const pA = freq[a] / N;
          if (pA > 0 && pAB > 0) h2 -= pAB * Math.log2(pAB / pA);
        }
        return {
          corpus_id, kind,
          result: {
            h2: +h2.toFixed(6),
            bigrams: M,
            interpretation: h2 < 2.5 ? 'Low: strong next-sign predictability (word-like structure)' : 'High: near-random next-sign (symbol soup)',
          },
        };
      }

      case 'block': {
        // Block entropy for block sizes 1..4
        const blocks = {};
        for (let L = 1; L <= Math.min(4, Math.floor(Math.log2(N))); L++) {
          const bf = {};
          let total = 0;
          for (let i = 0; i <= allTokens.length - L; i++) {
            const k = allTokens.slice(i, i + L).join('\x00');
            bf[k] = (bf[k] || 0) + 1;
            total++;
          }
          let h = 0;
          for (const c of Object.values(bf)) {
            const p = c / total;
            h -= p * Math.log2(p);
          }
          blocks[`H${L}`] = +h.toFixed(6);
        }
        return { corpus_id, kind, result: blocks };
      }

      case 'rényi': {
        // Rényi entropy of order alpha=2 (Collision entropy)
        const alpha = 2;
        let sum = 0;
        for (const c of Object.values(freq)) {
          const p = c / N;
          sum += Math.pow(p, alpha);
        }
        const h_renyi = (1 / (1 - alpha)) * Math.log2(sum);
        return {
          corpus_id, kind,
          result: {
            alpha,
            h_renyi: +h_renyi.toFixed(6),
            perplexity: +Math.pow(2, h_renyi).toFixed(4),
          },
        };
      }

      case 'yule_k': {
        // Yule's K = 10^4 * (sum(V_r * r^2) - N) / N^2
        // V_r = number of types occurring r times
        const vr = {};
        for (const c of Object.values(freq)) vr[c] = (vr[c] || 0) + 1;
        let sumVrR2 = 0;
        for (const [r, vCount] of Object.entries(vr)) {
          sumVrR2 += vCount * Math.pow(+r, 2);
        }
        const K = 1e4 * (sumVrR2 - N) / (N * N);
        // Simpson's D = sum p_i^2
        let D = 0;
        for (const c of Object.values(freq)) {
          const p = c / N;
          D += p * p;
        }
        return {
          corpus_id, kind,
          result: {
            yule_k: +K.toFixed(4),
            simpson_d: +D.toFixed(6),
            interpretation: K < 100 ? 'Rich vocabulary (language-like)' : K < 1000 ? 'Moderate richness' : 'Low richness (symbol repetition)',
          },
        };
      }

      default:
        return { error: `Unknown kind: ${kind}. Use shannon|conditional|block|rényi|yule_k` };
    }
  } catch (err) {
    return { error: err.message, corpus_id, kind };
  }
}

function interpretShannon(h, V) {
  const maxH = Math.log2(V);
  const ratio = h / maxH;
  if (ratio > 0.85) return `Near-maximal entropy (${(ratio * 100).toFixed(1)}% of max) — possible natural language`;
  if (ratio > 0.6) return `Moderate entropy — structured communication likely`;
  return `Low entropy (${(ratio * 100).toFixed(1)}% of max) — high redundancy / formulaic text`;
}
