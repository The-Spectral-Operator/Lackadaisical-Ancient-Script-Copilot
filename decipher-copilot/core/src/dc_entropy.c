#include "dc_entropy.h"
#include <math.h>
#include <string.h>
#include <stdlib.h>

dc_status_t dc_shannon_entropy(const dc_freq_table_t *freq, size_t total_tokens, double *out_h) {
    if (!freq || !out_h) return DC_ERR_NULL_PTR;
    if (total_tokens == 0) { *out_h = 0.0; return DC_OK; }

    double h = 0.0;
    for (size_t i = 0; i < freq->count; i++) {
        double p = (double)freq->entries[i].count / (double)total_tokens;
        if (p > 0.0) h -= p * log2(p);
    }
    *out_h = h;
    return DC_OK;
}

dc_status_t dc_conditional_entropy(const char **tokens, size_t n, double *out_h) {
    if (!tokens || !out_h) return DC_ERR_NULL_PTR;
    if (n < 2) { *out_h = 0.0; return DC_OK; }

    /* H(X|Y) = H(X,Y) - H(Y) */
    /* First compute bigram entropy */
    typedef struct { char *a; char *b; size_t count; } bigram_t;
    size_t cap = 256, bc = 0;
    bigram_t *bigrams = malloc(cap * sizeof(bigram_t));
    if (!bigrams) return DC_ERR_ALLOC;

    for (size_t i = 0; i + 1 < n; i++) {
        int found = -1;
        for (size_t j = 0; j < bc; j++) {
            if (strcmp(bigrams[j].a, tokens[i]) == 0 && strcmp(bigrams[j].b, tokens[i+1]) == 0) {
                found = (int)j; break;
            }
        }
        if (found >= 0) { bigrams[found].count++; }
        else {
            if (bc >= cap) { cap *= 2; bigrams = realloc(bigrams, cap * sizeof(bigram_t)); }
            bigrams[bc].a = strdup(tokens[i]);
            bigrams[bc].b = strdup(tokens[i+1]);
            bigrams[bc].count = 1;
            bc++;
        }
    }

    double total_bigrams = (double)(n - 1);
    double h_joint = 0.0;
    for (size_t i = 0; i < bc; i++) {
        double p = (double)bigrams[i].count / total_bigrams;
        if (p > 0.0) h_joint -= p * log2(p);
    }

    /* Compute unigram entropy of first token */
    dc_freq_table_t unigrams = {0};
    dc_freq_unigram(tokens, n, &unigrams);
    double h_unigram = 0.0;
    dc_shannon_entropy(&unigrams, n, &h_unigram);

    *out_h = h_joint - h_unigram;

    for (size_t i = 0; i < bc; i++) { free(bigrams[i].a); free(bigrams[i].b); }
    free(bigrams);
    dc_freq_table_free(&unigrams);
    return DC_OK;
}

dc_status_t dc_block_entropy(const char **tokens, size_t n, size_t block_size, double *out_h) {
    if (!tokens || !out_h) return DC_ERR_NULL_PTR;
    if (block_size == 0 || n < block_size) { *out_h = 0.0; return DC_OK; }

    size_t total_blocks = n - block_size + 1;
    /* Simple implementation: treat each block as a concatenated string */
    typedef struct { char *block; size_t count; } block_entry_t;
    size_t cap = 128, bc = 0;
    block_entry_t *blocks = malloc(cap * sizeof(block_entry_t));
    if (!blocks) return DC_ERR_ALLOC;

    for (size_t i = 0; i <= n - block_size; i++) {
        char buf[1024] = "";
        for (size_t j = 0; j < block_size; j++) {
            if (j > 0) strcat(buf, " ");
            strncat(buf, tokens[i + j], sizeof(buf) - strlen(buf) - 1);
        }
        int found = -1;
        for (size_t j = 0; j < bc; j++) {
            if (strcmp(blocks[j].block, buf) == 0) { found = (int)j; break; }
        }
        if (found >= 0) { blocks[found].count++; }
        else {
            if (bc >= cap) { cap *= 2; blocks = realloc(blocks, cap * sizeof(block_entry_t)); }
            blocks[bc].block = strdup(buf);
            blocks[bc].count = 1;
            bc++;
        }
    }

    double h = 0.0;
    for (size_t i = 0; i < bc; i++) {
        double p = (double)blocks[i].count / (double)total_blocks;
        if (p > 0.0) h -= p * log2(p);
        free(blocks[i].block);
    }
    free(blocks);
    *out_h = h;
    return DC_OK;
}

dc_status_t dc_renyi_entropy(const dc_freq_table_t *freq, size_t total_tokens, double alpha, double *out) {
    if (!freq || !out) return DC_ERR_NULL_PTR;
    if (total_tokens == 0) { *out = 0.0; return DC_OK; }
    if (fabs(alpha - 1.0) < 1e-10) return dc_shannon_entropy(freq, total_tokens, out);

    double sum = 0.0;
    for (size_t i = 0; i < freq->count; i++) {
        double p = (double)freq->entries[i].count / (double)total_tokens;
        if (p > 0.0) sum += pow(p, alpha);
    }
    *out = log2(sum) / (1.0 - alpha);
    return DC_OK;
}

dc_status_t dc_yule_k(const dc_freq_table_t *freq, size_t total_tokens, double *out_k) {
    if (!freq || !out_k) return DC_ERR_NULL_PTR;
    if (total_tokens == 0) { *out_k = 0.0; return DC_OK; }

    double n = (double)total_tokens;
    double sum_fi_sq = 0.0;
    for (size_t i = 0; i < freq->count; i++) {
        double fi = (double)freq->entries[i].count;
        sum_fi_sq += fi * fi;
    }
    /* Yule's K = 10000 * (M2 - N) / (N^2) where M2 = sum(fi^2) */
    *out_k = 10000.0 * (sum_fi_sq - n) / (n * n);
    return DC_OK;
}

dc_status_t dc_simpson_d(const dc_freq_table_t *freq, size_t total_tokens, double *out_d) {
    if (!freq || !out_d) return DC_ERR_NULL_PTR;
    if (total_tokens < 2) { *out_d = 0.0; return DC_OK; }

    double n = (double)total_tokens;
    double sum = 0.0;
    for (size_t i = 0; i < freq->count; i++) {
        double fi = (double)freq->entries[i].count;
        sum += fi * (fi - 1.0);
    }
    *out_d = sum / (n * (n - 1.0));
    return DC_OK;
}
