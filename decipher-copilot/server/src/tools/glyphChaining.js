/**
 * Glyph Chaining & Pattern Detection Engine
 * Detects recurring multi-glyph sequences (chains) in corpora:
 * - Single glyph analysis (frequency, positional, contextual)
 * - Bigram/trigram/n-gram chain detection with mutual information scoring
 * - Repeating motifs and formulaic sequences
 * - Chain-of-evidence linking for sign value proposals
 *
 * References:
 *   Packard 1974 — Sign grouping in Linear A
 *   Duhoux 2000 — Combinatorial analysis of undeciphered scripts
 *   Kober 1948 — Triplet analysis methodology (Linear B breakthrough)
 */

/**
 * Analyze a single glyph across the corpus.
 * @param {object} db
 * @param {object} args - { corpus_id, sign, include_context?: boolean }
 * @returns {object} Full single-glyph profile
 */
export function singleGlyphAnalysis(db, args) {
  const { corpus_id, sign, include_context = true } = args;
  if (!corpus_id || !sign) return { error: 'corpus_id and sign are required' };

  try {
    const inscriptions = db.system.prepare(
      'SELECT id, reference, transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) return { corpus_id, sign, error: 'no inscriptions' };

    let totalOccurrences = 0;
    let lineInitial = 0;
    let lineFinal = 0;
    let totalTokens = 0;
    const predecessors = {};
    const successors = {};
    const positions = []; // normalized position (0-1) within each inscription
    const coOccurrences = {}; // signs that appear in same inscription
    const contexts = []; // surrounding context windows

    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      totalTokens += tokens.length;
      let inscContainsSign = false;

      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === sign) {
          totalOccurrences++;
          inscContainsSign = true;

          // Positional
          if (i === 0) lineInitial++;
          if (i === tokens.length - 1) lineFinal++;
          positions.push(tokens.length > 1 ? i / (tokens.length - 1) : 0.5);

          // Predecessors & successors
          if (i > 0) predecessors[tokens[i - 1]] = (predecessors[tokens[i - 1]] || 0) + 1;
          if (i < tokens.length - 1) successors[tokens[i + 1]] = (successors[tokens[i + 1]] || 0) + 1;

          // Context window (±3 signs)
          if (include_context && contexts.length < 50) {
            const start = Math.max(0, i - 3);
            const end = Math.min(tokens.length, i + 4);
            contexts.push({
              reference: insc.reference,
              window: tokens.slice(start, end).join(' '),
              position: i - start,
            });
          }
        }
      }

      if (inscContainsSign) {
        for (const t of tokens) {
          if (t !== sign) coOccurrences[t] = (coOccurrences[t] || 0) + 1;
        }
      }
    }

    if (totalOccurrences === 0) {
      return { corpus_id, sign, found: false, message: `Sign "${sign}" not found in corpus` };
    }

    // Compute average position and variance
    const avgPos = positions.reduce((s, p) => s + p, 0) / positions.length;
    const varPos = positions.reduce((s, p) => s + (p - avgPos) ** 2, 0) / positions.length;

    // Sort predecessors/successors by frequency
    const topPredecessors = Object.entries(predecessors).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([s, c]) => ({ sign: s, count: c, probability: +(c / totalOccurrences).toFixed(4) }));
    const topSuccessors = Object.entries(successors).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([s, c]) => ({ sign: s, count: c, probability: +(c / totalOccurrences).toFixed(4) }));
    const topCoOccurrences = Object.entries(coOccurrences).sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([s, c]) => ({ sign: s, count: c }));

    // Determine positional preference
    let positionalPreference = 'medial';
    const initRate = lineInitial / totalOccurrences;
    const finalRate = lineFinal / totalOccurrences;
    if (initRate > 0.4) positionalPreference = 'initial';
    else if (finalRate > 0.4) positionalPreference = 'final';
    else if (avgPos < 0.3) positionalPreference = 'early';
    else if (avgPos > 0.7) positionalPreference = 'late';

    return {
      corpus_id,
      sign,
      found: true,
      frequency: {
        count: totalOccurrences,
        rate: +(totalOccurrences / totalTokens).toFixed(6),
        rank: computeRank(db, corpus_id, sign),
        inscriptions_containing: contexts.length > 0 ? new Set(contexts.map(c => c.reference)).size : null,
      },
      position: {
        preference: positionalPreference,
        line_initial_count: lineInitial,
        line_final_count: lineFinal,
        initial_rate: +initRate.toFixed(4),
        final_rate: +finalRate.toFixed(4),
        average_position: +avgPos.toFixed(4),
        position_variance: +varPos.toFixed(4),
      },
      combinatorics: {
        predecessor_count: Object.keys(predecessors).length,
        successor_count: Object.keys(successors).length,
        top_predecessors: topPredecessors,
        top_successors: topSuccessors,
        top_co_occurrences: topCoOccurrences,
      },
      ...(include_context && { contexts: contexts.slice(0, 25) }),
      interpretation: generateGlyphInterpretation(sign, positionalPreference, initRate, finalRate, topPredecessors, topSuccessors, totalOccurrences, totalTokens),
    };
  } catch (err) {
    return { error: err.message, corpus_id, sign };
  }
}

/**
 * Detect multi-glyph chains (repeating sequences) in a corpus.
 * @param {object} db
 * @param {object} args - { corpus_id, min_length?: number, max_length?: number, min_frequency?: number, score_method?: string }
 * @returns {object} Detected chains ranked by significance
 */
export function glyphChainDetection(db, args) {
  const { corpus_id, min_length = 2, max_length = 6, min_frequency = 2, score_method = 'mutual_info' } = args;
  if (!corpus_id) return { error: 'corpus_id is required' };

  try {
    const inscriptions = db.system.prepare(
      'SELECT id, reference, transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) return { corpus_id, chains: [], error: 'no inscriptions' };

    // Tokenize all inscriptions
    const allSequences = [];
    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      if (tokens.length > 0) allSequences.push(tokens);
    }

    // Compute unigram frequencies for MI calculation
    const uniFreq = {};
    let totalTokens = 0;
    for (const seq of allSequences) {
      for (const t of seq) {
        uniFreq[t] = (uniFreq[t] || 0) + 1;
        totalTokens++;
      }
    }

    // Extract n-grams of all requested lengths
    const chains = [];

    for (let n = min_length; n <= max_length; n++) {
      const ngramFreq = {};
      let totalNgrams = 0;

      for (const seq of allSequences) {
        for (let i = 0; i <= seq.length - n; i++) {
          const ngram = seq.slice(i, i + n).join(' ');
          ngramFreq[ngram] = (ngramFreq[ngram] || 0) + 1;
          totalNgrams++;
        }
      }

      // Filter by minimum frequency
      for (const [ngram, freq] of Object.entries(ngramFreq)) {
        if (freq < min_frequency) continue;

        const tokens = ngram.split(' ');
        let score;

        switch (score_method) {
          case 'mutual_info':
            score = computeChainMI(tokens, uniFreq, totalTokens, freq, totalNgrams);
            break;
          case 'log_likelihood':
            score = computeLogLikelihood(tokens, uniFreq, totalTokens, freq, totalNgrams);
            break;
          case 'dice':
            score = computeDiceCoefficient(tokens, uniFreq, freq);
            break;
          default:
            score = freq / totalNgrams;
        }

        chains.push({
          chain: ngram,
          tokens,
          length: n,
          frequency: freq,
          score: +score.toFixed(6),
          probability: +(freq / totalNgrams).toFixed(6),
        });
      }
    }

    // Sort by score descending
    chains.sort((a, b) => b.score - a.score);

    // Identify chain types
    const categorized = categorizeChains(chains.slice(0, 200), allSequences);

    // Persist top chains to database
    const now = Date.now();
    const persistCount = Math.min(chains.length, 500);
    for (let i = 0; i < persistCount; i++) {
      try {
        db.system.prepare(`
          INSERT OR REPLACE INTO glyph_chains (id, corpus_id, chain_type, chain_tokens, frequency, mutual_info, context_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${corpus_id}_${chains[i].chain.replace(/\s/g, '_')}`,
          corpus_id,
          chains[i].length === 2 ? 'bigram' : chains[i].length === 3 ? 'trigram' : `${chains[i].length}-gram`,
          chains[i].chain,
          chains[i].frequency,
          chains[i].score,
          '{}',
          now
        );
      } catch { /* ignore duplicates */ }
    }

    return {
      corpus_id,
      total_tokens: totalTokens,
      vocabulary: Object.keys(uniFreq).length,
      inscription_count: allSequences.length,
      parameters: { min_length, max_length, min_frequency, score_method },
      chain_count: chains.length,
      top_chains: chains.slice(0, 100),
      categories: categorized,
    };
  } catch (err) {
    return { error: err.message, corpus_id };
  }
}

/**
 * Multi-glyph contextual analysis: analyze a specific sequence in context.
 * @param {object} db
 * @param {object} args - { corpus_id, sequence: string (space-separated) }
 * @returns {object}
 */
export function multiGlyphAnalysis(db, args) {
  const { corpus_id, sequence } = args;
  if (!corpus_id || !sequence) return { error: 'corpus_id and sequence are required' };

  try {
    const tokens = sequence.trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { error: 'sequence must contain at least 2 signs' };

    const inscriptions = db.system.prepare(
      'SELECT id, reference, transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) return { corpus_id, sequence, error: 'no inscriptions' };

    const occurrences = [];
    let totalTokens = 0;
    const uniFreq = {};

    for (const insc of inscriptions) {
      const inscTokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      totalTokens += inscTokens.length;
      for (const t of inscTokens) uniFreq[t] = (uniFreq[t] || 0) + 1;

      // Find all occurrences of the sequence
      for (let i = 0; i <= inscTokens.length - tokens.length; i++) {
        let match = true;
        for (let j = 0; j < tokens.length; j++) {
          if (inscTokens[i + j] !== tokens[j]) { match = false; break; }
        }
        if (match) {
          const contextStart = Math.max(0, i - 3);
          const contextEnd = Math.min(inscTokens.length, i + tokens.length + 3);
          occurrences.push({
            reference: insc.reference,
            position: i,
            normalized_position: inscTokens.length > 1 ? i / (inscTokens.length - 1) : 0.5,
            context: inscTokens.slice(contextStart, contextEnd).join(' '),
            preceding: i > 0 ? inscTokens.slice(Math.max(0, i - 2), i).join(' ') : null,
            following: i + tokens.length < inscTokens.length ? inscTokens.slice(i + tokens.length, i + tokens.length + 2).join(' ') : null,
          });
        }
      }
    }

    if (occurrences.length === 0) {
      return { corpus_id, sequence, found: false, message: `Sequence "${sequence}" not found in corpus` };
    }

    // Compute mutual information for the chain
    const chainFreq = occurrences.length;
    const expectedFreq = tokens.reduce((acc, t) => acc * ((uniFreq[t] || 1) / totalTokens), 1) * totalTokens;
    const pmi = Math.log2(chainFreq / Math.max(expectedFreq, 0.001));

    // Positional analysis
    const avgPos = occurrences.reduce((s, o) => s + o.normalized_position, 0) / occurrences.length;
    const posVariance = occurrences.reduce((s, o) => s + (o.normalized_position - avgPos) ** 2, 0) / occurrences.length;

    // Preceding/following patterns
    const precedingPatterns = {};
    const followingPatterns = {};
    for (const occ of occurrences) {
      if (occ.preceding) precedingPatterns[occ.preceding] = (precedingPatterns[occ.preceding] || 0) + 1;
      if (occ.following) followingPatterns[occ.following] = (followingPatterns[occ.following] || 0) + 1;
    }

    return {
      corpus_id,
      sequence,
      tokens,
      found: true,
      frequency: chainFreq,
      pointwise_mutual_information: +pmi.toFixed(4),
      expected_by_chance: +expectedFreq.toFixed(4),
      observed_over_expected: +(chainFreq / Math.max(expectedFreq, 0.001)).toFixed(2),
      position: {
        average: +avgPos.toFixed(4),
        variance: +posVariance.toFixed(4),
        preference: avgPos < 0.3 ? 'initial' : avgPos > 0.7 ? 'final' : 'medial',
      },
      context_patterns: {
        top_preceding: Object.entries(precedingPatterns).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => ({ pattern: p, count: c })),
        top_following: Object.entries(followingPatterns).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p, c]) => ({ pattern: p, count: c })),
      },
      occurrences: occurrences.slice(0, 30),
      interpretation: pmi > 3 ? 'Highly significant collocation — this sequence is a fixed expression or compound sign'
        : pmi > 1.5 ? 'Significant collocation — signs appear together more than chance predicts'
        : pmi > 0 ? 'Mild positive association — may be meaningful or coincidental'
        : 'No significant association — signs appear together at or below chance levels',
    };
  } catch (err) {
    return { error: err.message, corpus_id, sequence };
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function computeRank(db, corpusId, sign) {
  try {
    const inscriptions = db.system.prepare(
      'SELECT transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpusId);
    const freq = {};
    for (const insc of inscriptions) {
      for (const t of (insc.transcription || '').split(/\s+/).filter(Boolean)) {
        freq[t] = (freq[t] || 0) + 1;
      }
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([s]) => s === sign);
    return idx >= 0 ? idx + 1 : null;
  } catch { return null; }
}

function computeChainMI(tokens, uniFreq, totalTokens, chainFreq, totalNgrams) {
  // Pointwise Mutual Information: log2(P(chain) / product(P(token_i)))
  const pChain = chainFreq / totalNgrams;
  let pIndependent = 1;
  for (const t of tokens) {
    pIndependent *= (uniFreq[t] || 1) / totalTokens;
  }
  return pIndependent > 0 ? Math.log2(pChain / pIndependent) : 0;
}

function computeLogLikelihood(tokens, uniFreq, totalTokens, chainFreq, totalNgrams) {
  // Log-likelihood ratio (G²) — better for sparse data than chi-squared
  const observed = chainFreq;
  let expected = totalNgrams;
  for (const t of tokens) {
    expected *= (uniFreq[t] || 1) / totalTokens;
  }
  if (expected <= 0 || observed <= 0) return 0;
  return 2 * observed * Math.log(observed / expected);
}

function computeDiceCoefficient(tokens, uniFreq, chainFreq) {
  if (tokens.length !== 2) return chainFreq; // Dice only defined for pairs
  const freqA = uniFreq[tokens[0]] || 1;
  const freqB = uniFreq[tokens[1]] || 1;
  return (2 * chainFreq) / (freqA + freqB);
}

function categorizeChains(chains, allSequences) {
  const categories = {
    formulaic: [], // chains that appear primarily at start/end of inscriptions
    lexical: [],   // chains with high MI (likely compound words/logograms)
    grammatical: [], // chains with moderate frequency and position flexibility
  };

  for (const chain of chains) {
    // Check if formulaic (appears mostly at boundaries)
    let boundaryCount = 0;
    let totalCount = 0;
    for (const seq of allSequences) {
      const seqStr = seq.join(' ');
      const chainStr = chain.chain;
      let idx = seqStr.indexOf(chainStr);
      while (idx >= 0) {
        totalCount++;
        if (idx === 0 || idx + chainStr.length === seqStr.length) boundaryCount++;
        idx = seqStr.indexOf(chainStr, idx + 1);
      }
    }

    const boundaryRate = totalCount > 0 ? boundaryCount / totalCount : 0;

    if (boundaryRate > 0.6 && chain.frequency >= 3) {
      categories.formulaic.push({ ...chain, boundary_rate: +boundaryRate.toFixed(3) });
    } else if (chain.score > 3.0) {
      categories.lexical.push(chain);
    } else if (chain.frequency >= 3) {
      categories.grammatical.push(chain);
    }
  }

  // Limit each category
  categories.formulaic = categories.formulaic.slice(0, 30);
  categories.lexical = categories.lexical.slice(0, 30);
  categories.grammatical = categories.grammatical.slice(0, 30);

  return categories;
}

function generateGlyphInterpretation(sign, posPref, initRate, finalRate, preds, succs, count, total) {
  const parts = [];
  parts.push(`Sign "${sign}" appears ${count} times (${((count / total) * 100).toFixed(2)}% of corpus).`);

  if (posPref === 'initial') parts.push(`Strong initial preference (${(initRate * 100).toFixed(0)}% initial) — may be a determinative, classifier, or sentence marker.`);
  else if (posPref === 'final') parts.push(`Strong final preference (${(finalRate * 100).toFixed(0)}% final) — may be a grammatical suffix, case marker, or punctuation.`);
  else parts.push(`Medial position preference — likely a content sign (logogram or phonogram).`);

  if (succs.length > 0 && succs[0].probability > 0.3) {
    parts.push(`Strongly predicts successor "${succs[0].sign}" (${(succs[0].probability * 100).toFixed(0)}%) — possible fixed expression or compound.`);
  }
  if (preds.length > 0 && preds[0].probability > 0.3) {
    parts.push(`Strongly predicted by predecessor "${preds[0].sign}" (${(preds[0].probability * 100).toFixed(0)}%).`);
  }

  const predCount = preds.length;
  const succCount = succs.length;
  if (predCount > 15 && succCount > 15) parts.push(`High combinatorial freedom (${predCount} predecessors, ${succCount} successors) — likely a common phonogram.`);
  else if (predCount < 5 && succCount < 5) parts.push(`Low combinatorial freedom — likely a specialized logogram or determinative.`);

  return parts.join(' ');
}
