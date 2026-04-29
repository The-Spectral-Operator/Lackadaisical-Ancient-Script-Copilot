# Decipherment Methods Reference

## Core Statistical Primitives

All analysis is grounded in peer-reviewed computational linguistics literature.
No "AI magic" — every metric is reproducible, citable, and auditable.

---

## 1. Zipf Law Fit

**What it measures**: Whether sign/word frequency follows a power law. Rank-frequency log-log slope ≈ -1.0 in natural language.

**Implementation**: OLS regression on log(rank) vs log(count). Goodness of fit via R². Deviation from ideal Zipf via Kolmogorov-Smirnov statistic.

**Interpretation**:
- Slope ≈ -1.0, R² ≥ 0.85, KS < 0.1 → Zipfian → likely communicative/linguistic system
- Slope ≈ 0 → flat distribution → random symbol inventory or non-linguistic
- Slope < -1.5 → extremely steep → very narrow vocabulary, formulaic/tally system

**Reference**: Zipf (1949); Rao et al. (2009) — used to argue Indus Valley script is linguistic vs. non-linguistic.

---

## 2. Shannon Entropy (H1)

**What it measures**: Unpredictability of the next sign. Bits per token.

**Formula**: H = -Σ p(x) log₂ p(x)

**Interpretation** (Rao 2009 framework):
- H1 near maximum (log₂ V) → near-uniform distribution → random or large diverse vocabulary
- H1 in 3.5–5.0 bits range → matches natural language
- H1 < 2.5 bits → highly redundant / formulaic

**Reference**: Shannon (1948); Rao et al. *Science* 2009.

---

## 3. Conditional Entropy (H2)

**What it measures**: Predictability of next sign given the current sign. Captures bigram structure.

**Formula**: H2 = -Σ p(a,b) log₂ p(b|a)

Low H2 → strong sequential constraints → word-like structure.
High H2 → near-random transitions.

Rao (2009) used the H1-H2 plane to separate linguistic scripts, nonlinguistic sequences, and random text.

---

## 4. Block Entropy

Extension of Shannon entropy to blocks of L signs. For natural language, H(L)/L decreases as L grows (long-range correlations). For random sequences, H(L)/L is constant.

Computed for L = 1..4 and plotted as a profile.

---

## 5. Rényi Entropy (order α=2)

**What it measures**: Collision entropy — probability that two randomly drawn tokens are the same.

**Formula**: Hα = 1/(1-α) × log₂ Σ pᵢᵅ

Lower collision entropy → more diverse vocabulary. Useful for comparing scripts of different sizes without vocabulary-size bias.

---

## 6. Yule's K / Simpson's D

**Yule's K**: 10⁴ × (Σ Vᵣ×r² - N) / N² — vocabulary richness measure.
- K < 100 → rich vocabulary (natural language typical)
- K > 1000 → impoverished vocabulary (formulaic / tally)

**Simpson's D**: Σ pᵢ² — probability that two random tokens are identical. Complement of diversity.

**Reference**: Yule (1944); Simpson (1949).

---

## 7. Frequency Analysis

**Unigrams**: Simple sign frequency ranked by count. Sign inventory size = vocabulary.

**Bigrams**: Co-occurrence pairs. High-frequency bigrams may be morpheme boundaries or common words.

**Trigrams**: Three-sign sequences. Used for positional pattern detection.

**Positional analysis**: Line-initial and line-final signs often have special syntactic roles (determinatives, case markers, sentence-final particles).

---

## 8. Cognate Alignment (Simulated Annealing)

Based on Tamburini (2025, *Frontiers in AI*) coupled simulated annealing framework.

**Problem**: Given two scripts (one undeciphered, one partially known), find a k-permutation mapping from undeciphered signs to known signs that maximizes:
- Phonological plausibility (sound preservation)
- Structural coherence (positional distribution match)
- Frequency rank correlation

**Algorithm**:
1. Start with a random sign mapping
2. Compute alignment score (frequency correlation × positional match)
3. Perturb: swap two sign assignments randomly
4. Accept if score improves; accept with probability exp(-ΔE/T) if it worsens
5. Cool temperature T over iterations
6. Report best mapping found + confidence interval from multiple runs

**Full implementation** in `core/` C engine via `dc_align_anneal()` (FFI). JS fallback in `tools/entropyReport.js` provides entropy profile without the annealing step.

---

## 9. Cross-Inscription Coherence

Given a proposed sign→reading map, validate it across the full corpus:
- **Collocation MI uplift**: does the proposed reading create higher mutual information between adjacent signs? (evidence of word structure)
- **N-gram coverage delta**: how many more n-gram types are explained by the hypothesis?
- **Broken-cognate count**: how many cognate pairs from reference languages are violated?

Used to rank competing hypotheses by corpus-wide evidence, not just single-inscription fit.

---

## 10. Glyph Vision Analysis

Vision LLMs (gemma4, llama3.2-vision, qwen2.5vl) receive inscription images as base64 PNGs and output:
- Detected sign IDs with bounding boxes
- Proposed phonetic values
- Comparison to known sign repertoires

Structured output mode (`format: JSONSchema`) ensures machine-readable sign lists. Always instruct the model to output JSON explicitly in the prompt as well (avoids whitespace generation).

PDFs are rasterized server-side (pdfjs-dist → node-canvas) at 150 DPI before sending. Maximum 500 pages per document.

---

## Script Coverage (April 2026)

48 dataset files covering 36 unique scripts:

| Script | Dataset | Notes |
|--------|---------|-------|
| Linear A | MASTER_SYMBOL_ENRICHED-2026-04-26 | Undeciphered Minoan |
| Linear B | MASTER-2026-04-27 | Deciphered Mycenaean Greek |
| Cypro-Minoan | MASTER-2025-09-11 | Undeciphered |
| Cretan Hieroglyphs | 2025-09-11 | Undeciphered |
| Indus Valley | v9.3 with IE/Dravidian | Undeciphered, 2025-01-04 |
| Proto-Elamite | FIXED_MASTER_2026-02-01 | Undeciphered |
| Linear Elamite | MASTER-2025-09-11 | Partially deciphered |
| Phaistos Disc | MASTER-2025-01-28 | Undeciphered |
| Voynich Manuscript | FULL_ENHANCED_2025-11-27 | Undeciphered, with translation candidates |
| Meroitic | MASTER v17 2026-02-26 | Partially deciphered |
| Byblos Syllabary | MASTER_v5_2025-11-11 | Undeciphered |
| Vinča | MASTER_2025-10-27 | Disputed: script vs. symbols |
| Tartaria Tablets | MASTER_03-26-2026 | Disputed |
| Proto-Sinaitic | MASTER_2025-11-11 | Ancestor of alphabet |
| Egyptian Hieroglyphs | Gardiner signs | Deciphered |
| Hieratic | Full | Deciphered |
| Demotic | Full | Deciphered |
| Akkadian | Full | Deciphered cuneiform |
| Sumerian | Borger sign list | Deciphered |
| Ugaritic | Full | Deciphered alphabetic cuneiform |
| Phoenician | Full | Deciphered |
| Paleo-Hebrew | Full | Deciphered |
| Aramaic | Full | Deciphered |
| Ancient Greek | Full | Deciphered |
| Glagolitic | Full | Deciphered Old Church Slavonic |
| Gothic | Full | Deciphered |
| Brahmi | Full + cultural contexts | Deciphered |
| Maya | Glyphs + grammar + phonetics | Deciphered |
| Ge'ez | Full | Deciphered Ethiopian |
| Coptic | Full | Deciphered |
| Tamil | Comprehensive | Deciphered |
| Telugu | Comprehensive | Deciphered |
| Kannada | Comprehensive | Deciphered |
| Malayalam | Comprehensive | Deciphered |
| Japanese | Full | Deciphered |
| Dravidian | Template | Reference |

---

## Realism Disclaimer

No method — computational or traditional — has definitively deciphered any currently undeciphered script. This system is a **research accelerator**, not an oracle.

Confidence scores are model-derived estimates, not ground truth. Every hypothesis generated by the AI is:
1. Stamped with the model name, digest, and exact prompt hash (`message_audit` table)
2. Marked with a numeric confidence (0.0–1.0)
3. Traceable to the specific corpus evidence used

Humans ratify. The AI proposes.
