#include "dc_stats.h"
#include <stdlib.h>
#include <string.h>

static int find_sign(const dc_freq_table_t *table, const char *sign) {
    for (size_t i = 0; i < table->count; i++) {
        if (strcmp(table->entries[i].sign_id, sign) == 0) return (int)i;
    }
    return -1;
}

dc_status_t dc_freq_unigram(const char **tokens, size_t n, dc_freq_table_t *out) {
    if (!tokens || !out) return DC_ERR_NULL_PTR;
    memset(out, 0, sizeof(*out));

    for (size_t i = 0; i < n; i++) {
        int idx = find_sign(out, tokens[i]);
        if (idx >= 0) {
            out->entries[idx].count++;
        } else {
            if (out->count >= out->capacity) {
                size_t new_cap = out->capacity == 0 ? 64 : out->capacity * 2;
                dc_freq_entry_t *new_entries = realloc(out->entries, new_cap * sizeof(dc_freq_entry_t));
                if (!new_entries) return DC_ERR_ALLOC;
                out->entries = new_entries;
                out->capacity = new_cap;
            }
            out->entries[out->count].sign_id = strdup(tokens[i]);
            if (!out->entries[out->count].sign_id) return DC_ERR_ALLOC;
            out->entries[out->count].count = 1;
            out->count++;
        }
    }

    /* Sort by count descending */
    for (size_t i = 0; i < out->count; i++) {
        for (size_t j = i + 1; j < out->count; j++) {
            if (out->entries[j].count > out->entries[i].count) {
                dc_freq_entry_t tmp = out->entries[i];
                out->entries[i] = out->entries[j];
                out->entries[j] = tmp;
            }
        }
    }
    return DC_OK;
}

dc_status_t dc_freq_bigram(const char **tokens, size_t n, dc_bigram_table_t *out) {
    if (!tokens || !out) return DC_ERR_NULL_PTR;
    memset(out, 0, sizeof(*out));

    for (size_t i = 0; i + 1 < n; i++) {
        int found = -1;
        for (size_t j = 0; j < out->count; j++) {
            if (strcmp(out->entries[j].sign_a, tokens[i]) == 0 &&
                strcmp(out->entries[j].sign_b, tokens[i + 1]) == 0) {
                found = (int)j;
                break;
            }
        }
        if (found >= 0) {
            out->entries[found].count++;
        } else {
            if (out->count >= out->capacity) {
                size_t new_cap = out->capacity == 0 ? 64 : out->capacity * 2;
                dc_bigram_entry_t *new_entries = realloc(out->entries, new_cap * sizeof(dc_bigram_entry_t));
                if (!new_entries) return DC_ERR_ALLOC;
                out->entries = new_entries;
                out->capacity = new_cap;
            }
            out->entries[out->count].sign_a = strdup(tokens[i]);
            out->entries[out->count].sign_b = strdup(tokens[i + 1]);
            if (!out->entries[out->count].sign_a || !out->entries[out->count].sign_b) return DC_ERR_ALLOC;
            out->entries[out->count].count = 1;
            out->count++;
        }
    }
    return DC_OK;
}

dc_status_t dc_freq_positional(const char **tokens, size_t n, bool line_initial, char **json_out) {
    (void)tokens; (void)n; (void)line_initial;
    if (!json_out) return DC_ERR_NULL_PTR;
    *json_out = strdup("[]");
    return *json_out ? DC_OK : DC_ERR_ALLOC;
}

dc_status_t dc_freq_table_free(dc_freq_table_t *table) {
    if (!table) return DC_ERR_NULL_PTR;
    for (size_t i = 0; i < table->count; i++) free(table->entries[i].sign_id);
    free(table->entries);
    memset(table, 0, sizeof(*table));
    return DC_OK;
}

dc_status_t dc_bigram_table_free(dc_bigram_table_t *table) {
    if (!table) return DC_ERR_NULL_PTR;
    for (size_t i = 0; i < table->count; i++) {
        free(table->entries[i].sign_a);
        free(table->entries[i].sign_b);
    }
    free(table->entries);
    memset(table, 0, sizeof(*table));
    return DC_OK;
}
