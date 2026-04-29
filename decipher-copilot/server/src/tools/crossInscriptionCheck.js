/**
 * Tool: cross_inscription_check
 * Validates a proposed sign→reading hypothesis across all inscriptions in a corpus.
 * Reports: collocation Mutual Information uplift, n-gram coverage delta, broken-cognate count.
 *
 * References:
 *   Tamburini 2025 (Frontiers in AI) — cross-inscription coherence constraints
 *   Snyder/Barzilay/Knight 2010 — monotonicity and cognate consistency
 */

/**
 * @param {object} db
 * @param {object} args - { corpus_id: string, hypothesis: Array<{sign: string, reading: string}> }
 * @returns {object}
 */
export function crossInscriptionCheck(db, args) {
  const { corpus_id, hypothesis } = args;
  if (!corpus_id) return { error: 'corpus_id is required' };
  if (!hypothesis || !Array.isArray(hypothesis) || hypothesis.length === 0) {
    return { error: 'hypothesis array is required (e.g. [{sign:"AB01", reading:"a"}, ...])' };
  }

  try {
    const inscriptions = db.system.prepare(
      'SELECT id, reference, transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) {
      return { corpus_id, error: 'no inscriptions in corpus' };
    }

    // Build hypothesis map: sign → reading
    const hypoMap = new Map(hypothesis.map(h => [h.sign, h.reading]));

    // Apply hypothesis to all inscriptions
    const translatedInscriptions = [];
    let coveredTokens = 0;
    let totalTokens = 0;

    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      const translated = tokens.map(t => hypoMap.get(t) || null);
      translatedInscriptions.push({
        id: insc.id,
        reference: insc.reference,
        original: tokens,
        translated,
      });
      totalTokens += tokens.length;
      coveredTokens += translated.filter(t => t !== null).length;
    }

    const coverage = totalTokens > 0 ? coveredTokens / totalTokens : 0;

    // Compute bigram Mutual Information uplift
    // MI(x,y) = log2(P(x,y) / (P(x)*P(y)))
    const readingBiFreq = {};
    const readingUniFreq = {};
    let totalBigrams = 0;
    let totalReadings = 0;

    for (const insc of translatedInscriptions) {
      const readings = insc.translated.filter(r => r !== null);
      for (let i = 0; i < readings.length; i++) {
        readingUniFreq[readings[i]] = (readingUniFreq[readings[i]] || 0) + 1;
        totalReadings++;
        if (i < readings.length - 1) {
          const pair = `${readings[i]}\x00${readings[i + 1]}`;
          readingBiFreq[pair] = (readingBiFreq[pair] || 0) + 1;
          totalBigrams++;
        }
      }
    }

    // Average MI across all observed bigrams
    let miSum = 0;
    let miCount = 0;
    for (const [pair, count] of Object.entries(readingBiFreq)) {
      const [a, b] = pair.split('\x00');
      const pAB = count / totalBigrams;
      const pA = (readingUniFreq[a] || 1) / totalReadings;
      const pB = (readingUniFreq[b] || 1) / totalReadings;
      if (pA > 0 && pB > 0 && pAB > 0) {
        miSum += pAB * Math.log2(pAB / (pA * pB));
        miCount++;
      }
    }
    const avgMI = miCount > 0 ? miSum / miCount : 0;

    // Detect broken cognates: signs that map to same reading but never co-occur
    // (suggesting the hypothesis over-maps)
    const readingToSigns = new Map();
    for (const [sign, reading] of hypoMap) {
      if (!readingToSigns.has(reading)) readingToSigns.set(reading, []);
      readingToSigns.get(reading).push(sign);
    }

    const brokenCognates = [];
    for (const [reading, signs] of readingToSigns) {
      if (signs.length < 2) continue;
      // Check if these signs ever appear in the same inscription
      let coOccur = false;
      for (const insc of translatedInscriptions) {
        const inscSigns = new Set(insc.original);
        const matches = signs.filter(s => inscSigns.has(s));
        if (matches.length >= 2) { coOccur = true; break; }
      }
      if (!coOccur) {
        brokenCognates.push({ reading, signs, issue: 'never co-occur (may be same sign with variants)' });
      }
    }

    // N-gram coverage: what percentage of unique bigrams are fully translated
    const originalBigramSet = new Set();
    const coveredBigramSet = new Set();
    for (const insc of translatedInscriptions) {
      for (let i = 0; i < insc.original.length - 1; i++) {
        const origPair = `${insc.original[i]} ${insc.original[i + 1]}`;
        originalBigramSet.add(origPair);
        if (insc.translated[i] !== null && insc.translated[i + 1] !== null) {
          coveredBigramSet.add(origPair);
        }
      }
    }
    const bigramCoverage = originalBigramSet.size > 0
      ? coveredBigramSet.size / originalBigramSet.size
      : 0;

    // Consistency score: do same signs always get same reading (they should by definition)
    // but also: do the resulting reading sequences look language-like?
    const readingVocab = Object.keys(readingUniFreq).length;
    const readingH1 = totalReadings > 0 ? computeShannon(readingUniFreq, totalReadings) : 0;

    return {
      corpus_id,
      hypothesis_signs: hypothesis.length,
      inscriptions_checked: inscriptions.length,
      coverage: {
        token_coverage: +(coverage * 100).toFixed(2),
        bigram_coverage: +(bigramCoverage * 100).toFixed(2),
        total_tokens: totalTokens,
        covered_tokens: coveredTokens,
      },
      mutual_information: {
        average_mi: +avgMI.toFixed(6),
        interpretation: avgMI > 0.1
          ? 'Positive MI: reading sequences show non-random collocation patterns (language-like)'
          : avgMI > 0
            ? 'Weak positive MI: marginal evidence of structured collocations'
            : 'Zero/negative MI: readings appear random — hypothesis may be incorrect',
      },
      broken_cognates: {
        count: brokenCognates.length,
        details: brokenCognates.slice(0, 20),
      },
      reading_statistics: {
        vocabulary: readingVocab,
        shannon_h1: +readingH1.toFixed(4),
        interpretation: readingH1 > 3.0
          ? 'High entropy — rich, language-like reading distribution'
          : readingH1 > 1.5
            ? 'Moderate entropy — structured but possibly formulaic'
            : 'Low entropy — highly repetitive readings (may indicate over-mapping)',
      },
    };
  } catch (err) {
    return { error: err.message, corpus_id };
  }
}

function computeShannon(freq, total) {
  let h = 0;
  for (const c of Object.values(freq)) {
    const p = c / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}
