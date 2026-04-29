#include "dc_api.h"
#include "dc_log.h"
#include "dc_error.h"
#include "dc_corpus.h"
#include "dc_entropy.h"
#include "dc_zipf.h"
#include "dc_align.h"
#include "dc_sha256.h"
#include "dc_b64.h"

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

struct dc_engine {
    dc_db *database;
    bool initialized;
};

static bool g_initialized = false;

DC_API int dc_init(const char *log_path) {
    if (g_initialized) return DC_OK;
    dc_status_t s = dc_log_init(log_path, DC_LOG_INFO);
    if (s != DC_OK) return s;
    g_initialized = true;
    DC_LOG_I("decipher-core initialized");
    return DC_OK;
}

DC_API void dc_shutdown(void) {
    if (!g_initialized) return;
    DC_LOG_I("decipher-core shutting down");
    dc_log_shutdown();
    g_initialized = false;
}

DC_API int dc_db_open(const char *db_path, const char *hex_key, dc_engine **out) {
    if (!db_path || !hex_key || !out) return DC_ERR_NULL_PTR;
    dc_engine *engine = calloc(1, sizeof(dc_engine));
    if (!engine) return DC_ERR_ALLOC;
    dc_status_t s = dc_db_init(db_path, hex_key, &engine->database);
    if (s != DC_OK) {
        free(engine);
        return s;
    }
    engine->initialized = true;
    *out = engine;
    return DC_OK;
}

DC_API void dc_db_close(dc_engine *engine) {
    if (!engine) return;
    if (engine->database) dc_db_close_handle(engine->database);
    free(engine);
}

DC_API int dc_corpus_load_json(dc_engine *engine, const char *json_utf8, size_t len, dc_corpus **out) {
    if (!engine || !json_utf8 || !out) return DC_ERR_NULL_PTR;
    (void)len;
    dc_status_t s = dc_corpus_create(out);
    if (s != DC_OK) return s;

    /* Simple JSON array parser: expects array of strings (sign sequences) */
    const char *p = json_utf8;
    while (*p && *p != '[') p++;
    if (!*p) { dc_corpus_free(*out); *out = NULL; return DC_ERR_PARSE; }
    p++; /* skip '[' */

    char buf[4096];
    while (*p) {
        while (*p && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t' || *p == ',')) p++;
        if (*p == ']') break;
        if (*p == '"') {
            p++;
            size_t i = 0;
            while (*p && *p != '"' && i < sizeof(buf) - 1) {
                if (*p == '\\' && *(p + 1)) { p++; }
                buf[i++] = *p++;
            }
            buf[i] = '\0';
            if (*p == '"') p++;
            dc_corpus_add_inscription(*out, buf);
        } else {
            p++;
        }
    }
    dc_corpus_compute_frequencies(*out);
    return DC_OK;
}

DC_API void dc_corpus_free(dc_corpus *corpus) {
    if (!corpus) return;
    for (size_t i = 0; i < corpus->token_count; i++) free(corpus->tokens[i]);
    free(corpus->tokens);
    for (size_t i = 0; i < corpus->inscription_count; i++) free(corpus->inscriptions[i]);
    free(corpus->inscriptions);
    for (size_t i = 0; i < corpus->unigrams.count; i++) free(corpus->unigrams.entries[i].sign_id);
    free(corpus->unigrams.entries);
    for (size_t i = 0; i < corpus->bigrams.count; i++) {
        free(corpus->bigrams.entries[i].sign_a);
        free(corpus->bigrams.entries[i].sign_b);
    }
    free(corpus->bigrams.entries);
    free(corpus);
}

static char *freq_table_to_json(const dc_freq_table_t *table) {
    size_t cap = 256 + table->count * 64;
    char *buf = malloc(cap);
    if (!buf) return NULL;
    size_t off = 0;
    off += (size_t)snprintf(buf + off, cap - off, "[");
    for (size_t i = 0; i < table->count && off < cap - 32; i++) {
        off += (size_t)snprintf(buf + off, cap - off, "%s{\"sign\":\"%s\",\"count\":%llu}",
            i > 0 ? "," : "", table->entries[i].sign_id, (unsigned long long)table->entries[i].count);
    }
    off += (size_t)snprintf(buf + off, cap - off, "]");
    return buf;
}

DC_API int dc_corpus_unigram(const dc_corpus *corpus, char **json_out) {
    if (!corpus || !json_out) return DC_ERR_NULL_PTR;
    *json_out = freq_table_to_json(&corpus->unigrams);
    return *json_out ? DC_OK : DC_ERR_ALLOC;
}

DC_API int dc_corpus_bigram(const dc_corpus *corpus, char **json_out) {
    if (!corpus || !json_out) return DC_ERR_NULL_PTR;
    size_t cap = 256 + corpus->bigrams.count * 96;
    char *buf = malloc(cap);
    if (!buf) return DC_ERR_ALLOC;
    size_t off = 0;
    off += (size_t)snprintf(buf + off, cap - off, "[");
    for (size_t i = 0; i < corpus->bigrams.count && off < cap - 64; i++) {
        off += (size_t)snprintf(buf + off, cap - off, "%s{\"a\":\"%s\",\"b\":\"%s\",\"count\":%llu}",
            i > 0 ? "," : "", corpus->bigrams.entries[i].sign_a,
            corpus->bigrams.entries[i].sign_b, (unsigned long long)corpus->bigrams.entries[i].count);
    }
    off += (size_t)snprintf(buf + off, cap - off, "]");
    *json_out = buf;
    return DC_OK;
}

DC_API int dc_corpus_trigram(const dc_corpus *corpus, char **json_out) {
    if (!corpus || !json_out) return DC_ERR_NULL_PTR;
    *json_out = strdup("[]");
    return *json_out ? DC_OK : DC_ERR_ALLOC;
}

DC_API int dc_corpus_zipf(const dc_corpus *corpus, char **json_out) {
    if (!corpus || !json_out) return DC_ERR_NULL_PTR;
    dc_zipf_result_t result;
    dc_status_t s = dc_zipf_fit(&corpus->unigrams, &result);
    if (s != DC_OK) return s;
    char buf[256];
    snprintf(buf, sizeof(buf),
        "{\"slope\":%.6f,\"r_squared\":%.6f,\"ks_statistic\":%.6f,\"ks_p_value\":%.6f}",
        result.slope, result.r_squared, result.ks_statistic, result.ks_p_value);
    *json_out = strdup(buf);
    return *json_out ? DC_OK : DC_ERR_ALLOC;
}

DC_API int dc_corpus_shannon(const dc_corpus *corpus, double *out_h) {
    if (!corpus || !out_h) return DC_ERR_NULL_PTR;
    return dc_shannon_entropy(&corpus->unigrams, corpus->token_count, out_h);
}

DC_API int dc_corpus_cond_entropy(const dc_corpus *corpus, double *out_h) {
    if (!corpus || !out_h) return DC_ERR_NULL_PTR;
    return dc_conditional_entropy((const char **)corpus->tokens, corpus->token_count, out_h);
}

DC_API int dc_corpus_renyi(const dc_corpus *corpus, double alpha, double *out) {
    if (!corpus || !out) return DC_ERR_NULL_PTR;
    return dc_renyi_entropy(&corpus->unigrams, corpus->token_count, alpha, out);
}

DC_API int dc_corpus_yule_k(const dc_corpus *corpus, double *out_k) {
    if (!corpus || !out_k) return DC_ERR_NULL_PTR;
    return dc_yule_k(&corpus->unigrams, corpus->token_count, out_k);
}

DC_API int dc_align_anneal(const dc_corpus *corpus, const char *known_lexicon_json,
                           const char *params_json, char **result_json) {
    if (!corpus || !result_json) return DC_ERR_NULL_PTR;
    (void)known_lexicon_json;
    (void)params_json;

    dc_anneal_params_t params = { .initial_temp = 100.0, .cooling_rate = 0.999, .max_iterations = 100000, .seed = 42 };
    dc_align_result_t result = {0};
    dc_status_t s = dc_align_coupled_anneal(corpus, NULL, 0, &params, &result);
    if (s != DC_OK) return s;
    s = dc_align_result_to_json(&result, result_json);
    dc_align_result_free(&result);
    return s;
}

DC_API int dc_sha256(const void *data, size_t n, uint8_t out32[32]) {
    return dc_sha256_impl(data, n, out32);
}

DC_API int dc_b64_encode(const void *in, size_t n, char *out, size_t out_cap, size_t *written) {
    return dc_b64_encode_impl((const uint8_t *)in, n, out, out_cap, written);
}

DC_API int dc_b64_decode(const char *in, size_t n, uint8_t *out, size_t out_cap, size_t *written) {
    return dc_b64_decode_impl(in, n, out, out_cap, written);
}

DC_API void dc_free(void *p) {
    free(p);
}
