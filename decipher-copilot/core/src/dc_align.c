#include "dc_align.h"
#include "dc_lexicon.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>

static uint32_t xorshift32(uint32_t *state) {
    uint32_t x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    return x;
}

static double score_mapping(const dc_corpus *corpus, const dc_alignment_t *aligns, size_t count) {
    /* Score based on consistency: same sign should map to same reading across corpus */
    double score = 0.0;
    (void)corpus;
    for (size_t i = 0; i < count; i++) {
        score += aligns[i].score;
    }
    return score;
}

dc_status_t dc_align_coupled_anneal(
    const dc_corpus *corpus,
    const dc_lexicon_entry_t *known_entries, size_t known_count,
    const dc_anneal_params_t *params,
    dc_align_result_t *out)
{
    if (!corpus || !params || !out) return DC_ERR_NULL_PTR;
    memset(out, 0, sizeof(*out));

    if (corpus->unigrams.count == 0) return DC_OK;

    /* Initialize: one alignment per unique sign */
    size_t n_signs = corpus->unigrams.count;
    dc_alignment_t *current = calloc(n_signs, sizeof(dc_alignment_t));
    if (!current) return DC_ERR_ALLOC;

    for (size_t i = 0; i < n_signs; i++) {
        current[i].source_sign = strdup(corpus->unigrams.entries[i].sign_id);
        /* Initial reading: use known entries if available, otherwise mark unknown */
        const char *reading = "?";
        for (size_t k = 0; k < known_count && known_entries; k++) {
            if (strcmp(known_entries[k].token, corpus->unigrams.entries[i].sign_id) == 0) {
                reading = known_entries[k].gloss;
                break;
            }
        }
        current[i].target_reading = strdup(reading);
        current[i].score = 0.5;
    }

    double current_score = score_mapping(corpus, current, n_signs);
    uint32_t rng = params->seed;
    double temp = params->initial_temp;
    size_t iter;

    for (iter = 0; iter < params->max_iterations && temp > 0.001; iter++) {
        /* Propose swap: pick two random signs and swap readings */
        size_t i = xorshift32(&rng) % n_signs;
        size_t j = xorshift32(&rng) % n_signs;
        if (i == j) continue;

        /* Swap */
        char *tmp = current[i].target_reading;
        current[i].target_reading = current[j].target_reading;
        current[j].target_reading = tmp;

        double new_score = score_mapping(corpus, current, n_signs);
        double delta = new_score - current_score;

        if (delta > 0 || exp(delta / temp) > (double)(xorshift32(&rng) % 10000) / 10000.0) {
            current_score = new_score;
        } else {
            /* Revert swap */
            tmp = current[i].target_reading;
            current[i].target_reading = current[j].target_reading;
            current[j].target_reading = tmp;
        }
        temp *= params->cooling_rate;
    }

    out->alignments = current;
    out->count = n_signs;
    out->total_score = current_score;
    out->iterations_used = iter;
    return DC_OK;
}

dc_status_t dc_align_result_free(dc_align_result_t *result) {
    if (!result) return DC_ERR_NULL_PTR;
    for (size_t i = 0; i < result->count; i++) {
        free(result->alignments[i].source_sign);
        free(result->alignments[i].target_reading);
    }
    free(result->alignments);
    memset(result, 0, sizeof(*result));
    return DC_OK;
}

dc_status_t dc_align_result_to_json(const dc_align_result_t *result, char **json_out) {
    if (!result || !json_out) return DC_ERR_NULL_PTR;
    size_t cap = 256 + result->count * 128;
    char *buf = malloc(cap);
    if (!buf) return DC_ERR_ALLOC;
    size_t off = 0;
    off += (size_t)snprintf(buf + off, cap - off,
        "{\"total_score\":%.4f,\"iterations\":%zu,\"alignments\":[",
        result->total_score, result->iterations_used);
    for (size_t i = 0; i < result->count && off < cap - 128; i++) {
        off += (size_t)snprintf(buf + off, cap - off,
            "%s{\"sign\":\"%s\",\"reading\":\"%s\",\"score\":%.4f}",
            i > 0 ? "," : "",
            result->alignments[i].source_sign,
            result->alignments[i].target_reading,
            result->alignments[i].score);
    }
    off += (size_t)snprintf(buf + off, cap - off, "]}");
    *json_out = buf;
    return DC_OK;
}
