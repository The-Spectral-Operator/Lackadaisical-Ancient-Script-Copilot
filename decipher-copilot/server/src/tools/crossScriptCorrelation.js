/**
 * Cross-Script Correlation Engine
 * Detects structural similarities between different writing systems by comparing:
 * - Frequency distributions (Zipf profile overlap)
 * - Sign inventory size ratios
 * - Bigram transition matrices (cosine similarity)
 * - Positional patterns (initial/final sign distributions)
 * - Shannon entropy profiles
 *
 * References:
 *   Rao et al. 2009 — Entropic Evidence for Linguistic Structure
 *   Tamburini 2025 — Cross-inscription coherence
 *   Sproat 2014 — Comparative decipherment statistics
 */

/**
 * Run cross-script correlation between two corpora.
 * @param {object} db - Database handle
 * @param {object} args - { corpus_a_id, corpus_b_id, methods?: string[] }
 * @returns {object} Correlation results with per-method scores
 */
export function crossScriptCorrelation(db, args) {
  const { corpus_a_id, corpus_b_id, methods = ['frequency', 'bigram', 'positional', 'entropy'] } = args;

  if (!corpus_a_id || !corpus_b_id) {
    return { error: 'corpus_a_id and corpus_b_id are required' };
  }

  try {
    const corpusA = loadCorpusTokens(db, corpus_a_id);
    const corpusB = loadCorpusTokens(db, corpus_b_id);

    if (corpusA.tokens.length === 0) return { error: `Corpus A (${corpus_a_id}) has no tokens` };
    if (corpusB.tokens.length === 0) return { error: `Corpus B (${corpus_b_id}) has no tokens` };

    const results = {
      corpus_a: { id: corpus_a_id, inscription_count: corpusA.inscriptionCount, total_tokens: corpusA.tokens.length, vocabulary: corpusA.vocabulary },
      corpus_b: { id: corpus_b_id, inscription_count: corpusB.inscriptionCount, total_tokens: corpusB.tokens.length, vocabulary: corpusB.vocabulary },
      correlations: {},
      overall_score: 0,
    };

    let scoreSum = 0;
    let scoreCount = 0;

    for (const method of methods) {
      switch (method) {
        case 'frequency': {
          const r = frequencyCorrelation(corpusA, corpusB);
          results.correlations.frequency = r;
          scoreSum += r.score;
          scoreCount++;
          break;
        }
        case 'bigram': {
          const r = bigramCorrelation(corpusA, corpusB);
          results.correlations.bigram = r;
          scoreSum += r.score;
          scoreCount++;
          break;
        }
        case 'positional': {
          const r = positionalCorrelation(corpusA, corpusB);
          results.correlations.positional = r;
          scoreSum += r.score;
          scoreCount++;
          break;
        }
        case 'entropy': {
          const r = entropyCorrelation(corpusA, corpusB);
          results.correlations.entropy = r;
          scoreSum += r.score;
          scoreCount++;
          break;
        }
        default:
          results.correlations[method] = { error: `Unknown method: ${method}` };
      }
    }

    results.overall_score = scoreCount > 0 ? +(scoreSum / scoreCount).toFixed(4) : 0;
    results.interpretation = interpretScore(results.overall_score);

    return results;
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Run correlation across all pairs of corpora.
 * @param {object} db
 * @param {object} args - { methods?: string[], min_inscriptions?: number }
 * @returns {object} Matrix of pairwise correlations
 */
export function crossScriptMatrix(db, args) {
  const { methods = ['frequency', 'bigram', 'entropy'], min_inscriptions = 5 } = args || {};

  try {
    const corpora = db.system.prepare(
      'SELECT c.id, c.name, c.script_id, COUNT(i.id) as inscription_count FROM corpora c LEFT JOIN inscriptions i ON i.corpus_id = c.id GROUP BY c.id HAVING inscription_count >= ?'
    ).all(min_inscriptions);

    if (corpora.length < 2) {
      return { error: 'Need at least 2 corpora with sufficient inscriptions', corpora_found: corpora.length };
    }

    const pairs = [];

    for (let i = 0; i < corpora.length; i++) {
      for (let j = i + 1; j < corpora.length; j++) {
        const result = crossScriptCorrelation(db, {
          corpus_a_id: corpora[i].id,
          corpus_b_id: corpora[j].id,
          methods,
        });

        pairs.push({
          corpus_a: { id: corpora[i].id, name: corpora[i].name, script: corpora[i].script_id },
          corpus_b: { id: corpora[j].id, name: corpora[j].name, script: corpora[j].script_id },
          overall_score: result.overall_score || 0,
          correlations: result.correlations || {},
        });
      }
    }

    // Sort by score descending
    pairs.sort((a, b) => b.overall_score - a.overall_score);

    return {
      corpora_count: corpora.length,
      pair_count: pairs.length,
      methods,
      pairs,
      top_correlations: pairs.slice(0, 10),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function loadCorpusTokens(db, corpusId) {
  const inscriptions = db.system.prepare(
    'SELECT id, transcription FROM inscriptions WHERE corpus_id = ?'
  ).all(corpusId);

  const allTokens = [];
  const inscriptionTokens = [];

  for (const insc of inscriptions) {
    const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
    allTokens.push(...tokens);
    inscriptionTokens.push(tokens);
  }

  // Compute frequency distribution
  const freq = {};
  for (const t of allTokens) {
    freq[t] = (freq[t] || 0) + 1;
  }

  // Compute bigram frequencies
  const bigramFreq = {};
  for (const tokens of inscriptionTokens) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const key = `${tokens[i]}\x00${tokens[i + 1]}`;
      bigramFreq[key] = (bigramFreq[key] || 0) + 1;
    }
  }

  // Positional statistics
  const initialFreq = {};
  const finalFreq = {};
  for (const tokens of inscriptionTokens) {
    if (tokens.length > 0) {
      initialFreq[tokens[0]] = (initialFreq[tokens[0]] || 0) + 1;
      finalFreq[tokens[tokens.length - 1]] = (finalFreq[tokens[tokens.length - 1]] || 0) + 1;
    }
  }

  return {
    tokens: allTokens,
    inscriptionTokens,
    inscriptionCount: inscriptions.length,
    vocabulary: Object.keys(freq).length,
    freq,
    bigramFreq,
    initialFreq,
    finalFreq,
  };
}

/**
 * Frequency profile correlation:
 * Compare rank-frequency distributions using Spearman's rank correlation
 * of normalized frequency vectors.
 */
function frequencyCorrelation(a, b) {
  // Normalize frequencies to proportions
  const totalA = a.tokens.length;
  const totalB = b.tokens.length;

  const propsA = Object.entries(a.freq).map(([, c]) => c / totalA).sort((x, y) => y - x);
  const propsB = Object.entries(b.freq).map(([, c]) => c / totalB).sort((x, y) => y - x);

  // Compare rank-frequency profiles (top 100 ranks)
  const maxRank = Math.min(100, propsA.length, propsB.length);
  if (maxRank < 5) return { score: 0, detail: 'insufficient vocabulary' };

  // Cosine similarity of top-N frequency vectors
  let dotProduct = 0, magA = 0, magB = 0;
  for (let i = 0; i < maxRank; i++) {
    const va = propsA[i] || 0;
    const vb = propsB[i] || 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const cosine = (magA > 0 && magB > 0) ? dotProduct / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;

  // Vocabulary ratio (scripts with similar complexity have similar vocab sizes per token count)
  const vocabRatioA = a.vocabulary / Math.sqrt(totalA);
  const vocabRatioB = b.vocabulary / Math.sqrt(totalB);
  const vocabSim = 1 - Math.abs(vocabRatioA - vocabRatioB) / Math.max(vocabRatioA, vocabRatioB);

  const score = +(cosine * 0.7 + Math.max(0, vocabSim) * 0.3).toFixed(4);

  return {
    score,
    cosine_similarity: +cosine.toFixed(4),
    vocabulary_similarity: +vocabSim.toFixed(4),
    vocab_a: a.vocabulary,
    vocab_b: b.vocabulary,
    interpretation: cosine > 0.9 ? 'Very similar frequency profiles (possible structural kinship)'
      : cosine > 0.7 ? 'Similar frequency profiles (comparable script types)'
      : cosine > 0.5 ? 'Moderate similarity (some structural overlap)'
      : 'Different frequency profiles (distinct script structures)',
  };
}

/**
 * Bigram transition matrix correlation:
 * Compares the structural patterns of sign pairs between scripts.
 */
function bigramCorrelation(a, b) {
  // Compute normalized bigram transition probabilities
  const transA = computeTransitionEntropy(a.freq, a.bigramFreq);
  const transB = computeTransitionEntropy(b.freq, b.bigramFreq);

  // Compare average transition entropy
  const entropyDiff = Math.abs(transA.avgEntropy - transB.avgEntropy);
  const maxEntropy = Math.max(transA.avgEntropy, transB.avgEntropy);
  const entropySim = maxEntropy > 0 ? 1 - entropyDiff / maxEntropy : 1;

  // Compare bigram-to-unigram ratio
  const bigramRatioA = Object.keys(a.bigramFreq).length / Math.max(1, a.vocabulary);
  const bigramRatioB = Object.keys(b.bigramFreq).length / Math.max(1, b.vocabulary);
  const ratioSim = 1 - Math.abs(bigramRatioA - bigramRatioB) / Math.max(bigramRatioA, bigramRatioB);

  const score = +(entropySim * 0.6 + Math.max(0, ratioSim) * 0.4).toFixed(4);

  return {
    score,
    transition_entropy_a: +transA.avgEntropy.toFixed(4),
    transition_entropy_b: +transB.avgEntropy.toFixed(4),
    entropy_similarity: +entropySim.toFixed(4),
    bigram_ratio_a: +bigramRatioA.toFixed(4),
    bigram_ratio_b: +bigramRatioB.toFixed(4),
    interpretation: score > 0.8 ? 'Very similar bigram structure (possible related writing systems)'
      : score > 0.6 ? 'Comparable bigram complexity'
      : 'Different bigram structures',
  };
}

/**
 * Positional correlation:
 * Compare which signs prefer initial vs final positions.
 */
function positionalCorrelation(a, b) {
  // Compute initial/final ratios for each corpus
  const posRatioA = computePositionalRatio(a);
  const posRatioB = computePositionalRatio(b);

  // Compare the distribution of positional preferences
  const distA = Object.values(posRatioA).sort((x, y) => y - x);
  const distB = Object.values(posRatioB).sort((x, y) => y - x);

  // Kolmogorov-Smirnov style comparison
  const maxLen = Math.min(50, distA.length, distB.length);
  if (maxLen < 3) return { score: 0, detail: 'insufficient positional data' };

  let ksMax = 0;
  for (let i = 0; i < maxLen; i++) {
    const cdfA = distA.slice(0, i + 1).reduce((s, v) => s + v, 0);
    const cdfB = distB.slice(0, i + 1).reduce((s, v) => s + v, 0);
    ksMax = Math.max(ksMax, Math.abs(cdfA - cdfB));
  }

  const score = +(1 - Math.min(1, ksMax)).toFixed(4);

  return {
    score,
    ks_distance: +ksMax.toFixed(4),
    initial_vocab_a: Object.keys(a.initialFreq).length,
    initial_vocab_b: Object.keys(b.initialFreq).length,
    final_vocab_a: Object.keys(a.finalFreq).length,
    final_vocab_b: Object.keys(b.finalFreq).length,
    interpretation: score > 0.8 ? 'Very similar positional patterns (scripts use positions similarly)'
      : score > 0.6 ? 'Comparable positional structure'
      : 'Different positional usage patterns',
  };
}

/**
 * Entropy profile correlation:
 * Compare Shannon H1, conditional H2, and entropy rate.
 */
function entropyCorrelation(a, b) {
  const h1A = computeShannon(a.freq, a.tokens.length);
  const h1B = computeShannon(b.freq, b.tokens.length);

  const h2A = computeConditionalEntropy(a.freq, a.bigramFreq, a.tokens.length);
  const h2B = computeConditionalEntropy(b.freq, b.bigramFreq, b.tokens.length);

  // Normalize entropies by max possible
  const maxHA = Math.log2(a.vocabulary);
  const maxHB = Math.log2(b.vocabulary);
  const ratioA = maxHA > 0 ? h1A / maxHA : 0;
  const ratioB = maxHB > 0 ? h1B / maxHB : 0;

  const ratioDiff = Math.abs(ratioA - ratioB);
  const h1Sim = 1 - ratioDiff;

  const condRatioA = h1A > 0 ? h2A / h1A : 0;
  const condRatioB = h1B > 0 ? h2B / h1B : 0;
  const condSim = 1 - Math.abs(condRatioA - condRatioB);

  const score = +(h1Sim * 0.5 + condSim * 0.5).toFixed(4);

  return {
    score,
    h1_a: +h1A.toFixed(4),
    h1_b: +h1B.toFixed(4),
    h2_a: +h2A.toFixed(4),
    h2_b: +h2B.toFixed(4),
    h1_ratio_a: +ratioA.toFixed(4),
    h1_ratio_b: +ratioB.toFixed(4),
    h1_similarity: +h1Sim.toFixed(4),
    conditional_similarity: +condSim.toFixed(4),
    interpretation: score > 0.85 ? 'Nearly identical entropy profiles (strong structural match)'
      : score > 0.7 ? 'Similar information density (comparable script types)'
      : score > 0.5 ? 'Moderate entropy similarity'
      : 'Different information density profiles',
  };
}

function computeShannon(freq, total) {
  let h = 0;
  for (const c of Object.values(freq)) {
    const p = c / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

function computeConditionalEntropy(uniFreq, bigramFreq, totalTokens) {
  let h2 = 0;
  const totalBigrams = Object.values(bigramFreq).reduce((s, c) => s + c, 0);
  if (totalBigrams === 0) return 0;

  for (const [pair, count] of Object.entries(bigramFreq)) {
    const [a] = pair.split('\x00');
    const pAB = count / totalBigrams;
    const pA = (uniFreq[a] || 1) / totalTokens;
    if (pAB > 0 && pA > 0) {
      h2 -= pAB * Math.log2(pAB / pA);
    }
  }
  return Math.max(0, h2);
}

function computeTransitionEntropy(uniFreq, bigramFreq) {
  // For each sign, compute entropy of its successor distribution
  const successors = {};
  for (const [pair, count] of Object.entries(bigramFreq)) {
    const [a] = pair.split('\x00');
    if (!successors[a]) successors[a] = {};
    successors[a][pair] = count;
  }

  let totalEntropy = 0;
  let count = 0;
  for (const [, succs] of Object.entries(successors)) {
    const total = Object.values(succs).reduce((s, c) => s + c, 0);
    let h = 0;
    for (const c of Object.values(succs)) {
      const p = c / total;
      if (p > 0) h -= p * Math.log2(p);
    }
    totalEntropy += h;
    count++;
  }

  return { avgEntropy: count > 0 ? totalEntropy / count : 0, signCount: count };
}

function computePositionalRatio(corpus) {
  const ratios = {};
  const totalInitial = Object.values(corpus.initialFreq).reduce((s, c) => s + c, 0) || 1;
  const totalFinal = Object.values(corpus.finalFreq).reduce((s, c) => s + c, 0) || 1;

  for (const sign of Object.keys(corpus.freq)) {
    const initProp = (corpus.initialFreq[sign] || 0) / totalInitial;
    const finalProp = (corpus.finalFreq[sign] || 0) / totalFinal;
    ratios[sign] = initProp - finalProp; // positive = prefers initial, negative = prefers final
  }
  return ratios;
}

function interpretScore(score) {
  if (score > 0.85) return 'Strong structural similarity — these scripts share fundamental organizational properties. May indicate genetic relationship, areal influence, or convergent evolution under similar constraints.';
  if (score > 0.7) return 'Notable structural similarity — comparable complexity and organization. Possible typological kinship or similar underlying language structures.';
  if (score > 0.5) return 'Moderate structural overlap — some shared organizational features but significant differences in detail.';
  if (score > 0.3) return 'Weak correlation — different structural properties with only superficial similarities.';
  return 'Minimal correlation — these scripts appear structurally independent.';
}
