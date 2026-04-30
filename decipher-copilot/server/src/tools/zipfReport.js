/**
 * Tool: zipf_report
 * Computes Zipf-law rank-frequency fit for a corpus.
 * Returns: log-log slope, R², Kolmogorov-Smirnov statistic vs ideal Zipf.
 *
 * Zipf's law: f(r) ∝ r^(-α) where α ≈ 1 for natural language.
 * Log-linearised: log(f) = -α * log(r) + C
 */

/**
 * @param {object} db
 * @param {object} args - { corpus_id: string }
 * @returns {object}
 */
export function zipfReport(db, args) {
  const { corpus_id } = args;
  if (!corpus_id) return { error: 'corpus_id is required' };

  try {
    const inscriptions = db.system.prepare(
      'SELECT transcription FROM inscriptions WHERE corpus_id = ?'
    ).all(corpus_id);

    if (inscriptions.length === 0) {
      return { corpus_id, result: null, error: 'no inscriptions' };
    }

    // Tokenize and count frequencies
    const freq = {};
    let N = 0;
    for (const insc of inscriptions) {
      const tokens = (insc.transcription || '').trim().split(/\s+/).filter(Boolean);
      for (const t of tokens) {
        freq[t] = (freq[t] || 0) + 1;
        N++;
      }
    }

    if (N < 10) {
      return { corpus_id, result: null, error: 'insufficient tokens for Zipf fit (need ≥10)' };
    }

    // Sort by descending frequency (rank order)
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const R = sorted.length; // vocabulary size

    // Log-log linear regression: log(count) = alpha * log(rank) + C
    // Using OLS on log-transformed data
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    const points = [];
    for (let i = 0; i < R; i++) {
      const rank = i + 1;
      const count = sorted[i][1];
      const lx = Math.log(rank);
      const ly = Math.log(count);
      sumX += lx;
      sumY += ly;
      sumXX += lx * lx;
      sumXY += lx * ly;
      points.push({ rank, token: sorted[i][0], count, log_rank: +lx.toFixed(4), log_freq: +ly.toFixed(4) });
    }

    const denom = R * sumXX - sumX * sumX;
    const slope = denom !== 0 ? (R * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / R;

    // R² coefficient of determination
    const yMean = sumY / R;
    let ssTot = 0, ssRes = 0;
    for (const p of points) {
      const predicted = slope * p.log_rank + intercept;
      ssRes += Math.pow(p.log_freq - predicted, 2);
      ssTot += Math.pow(p.log_freq - yMean, 2);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    // Kolmogorov-Smirnov statistic vs ideal Zipf (α=1)
    // Empirical CDF vs theoretical Zipf CDF
    const harmonicN = Array.from({ length: R }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);
    let ksMax = 0;
    let cumEmp = 0;
    for (let i = 0; i < R; i++) {
      cumEmp += sorted[i][1] / N;
      const cumTheo = harmonicSeries(i + 1) / harmonicN;
      ksMax = Math.max(ksMax, Math.abs(cumEmp - cumTheo));
    }

    const interpretation = interpretZipf(slope, r2, ksMax);

    return {
      corpus_id,
      result: {
        slope: +slope.toFixed(4),         // expect ≈ -1.0 for natural language
        intercept: +intercept.toFixed(4),
        r_squared: +r2.toFixed(4),        // expect ≥ 0.85 for Zipfian
        ks_stat: +ksMax.toFixed(4),       // smaller = better fit; < 0.1 is excellent
        tokens: N,
        vocabulary: R,
        top30: points.slice(0, 30),
        interpretation,
      },
    };
  } catch (err) {
    return { error: err.message, corpus_id };
  }
}

function harmonicSeries(n) {
  let s = 0;
  for (let i = 1; i <= n; i++) s += 1 / i;
  return s;
}

function interpretZipf(slope, r2, ks) {
  const absSlope = Math.abs(slope);
  const parts = [];
  if (r2 >= 0.85) parts.push(`Strong Zipfian fit (R²=${r2.toFixed(3)})`);
  else if (r2 >= 0.6) parts.push(`Moderate Zipfian fit (R²=${r2.toFixed(3)})`);
  else parts.push(`Weak Zipfian fit (R²=${r2.toFixed(3)}) — may be non-linguistic`);

  if (absSlope >= 0.8 && absSlope <= 1.3) parts.push(`slope=${slope.toFixed(3)} ≈ -1 (natural language range)`);
  else if (absSlope < 0.8) parts.push(`slope=${slope.toFixed(3)} flatter than natural language (formulaic/inventory list?)`);
  else parts.push(`slope=${slope.toFixed(3)} steeper than natural language (narrow vocabulary?)`);

  if (ks < 0.05) parts.push('KS=excellent fit to ideal Zipf');
  else if (ks < 0.1) parts.push('KS=good fit');
  else parts.push(`KS=${ks.toFixed(3)} — notable deviation from pure Zipf`);

  return parts.join('; ');
}
