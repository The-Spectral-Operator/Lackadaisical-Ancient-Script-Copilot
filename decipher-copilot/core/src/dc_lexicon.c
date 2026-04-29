#include "dc_lexicon.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

struct dc_lexicon {
    dc_lexicon_entry_t *entries;
    size_t count;
    size_t capacity;
};

dc_status_t dc_lexicon_create(dc_lexicon **out) {
    if (!out) return DC_ERR_NULL_PTR;
    dc_lexicon *lex = calloc(1, sizeof(dc_lexicon));
    if (!lex) return DC_ERR_ALLOC;
    *out = lex;
    return DC_OK;
}

dc_status_t dc_lexicon_free(dc_lexicon *lex) {
    if (!lex) return DC_ERR_NULL_PTR;
    for (size_t i = 0; i < lex->count; i++) {
        free(lex->entries[i].token);
        free(lex->entries[i].gloss);
        free(lex->entries[i].pos);
        free(lex->entries[i].source);
        free(lex->entries[i].notes);
    }
    free(lex->entries);
    free(lex);
    return DC_OK;
}

dc_status_t dc_lexicon_add_entry(dc_lexicon *lex, const dc_lexicon_entry_t *entry) {
    if (!lex || !entry) return DC_ERR_NULL_PTR;
    if (lex->count >= lex->capacity) {
        size_t new_cap = lex->capacity == 0 ? 64 : lex->capacity * 2;
        dc_lexicon_entry_t *new_entries = realloc(lex->entries, new_cap * sizeof(dc_lexicon_entry_t));
        if (!new_entries) return DC_ERR_ALLOC;
        lex->entries = new_entries;
        lex->capacity = new_cap;
    }
    dc_lexicon_entry_t *e = &lex->entries[lex->count];
    e->token = entry->token ? strdup(entry->token) : NULL;
    e->gloss = entry->gloss ? strdup(entry->gloss) : NULL;
    e->pos = entry->pos ? strdup(entry->pos) : NULL;
    e->confidence = entry->confidence;
    e->source = entry->source ? strdup(entry->source) : NULL;
    e->notes = entry->notes ? strdup(entry->notes) : NULL;
    lex->count++;
    return DC_OK;
}

dc_status_t dc_lexicon_lookup(const dc_lexicon *lex, const char *token, dc_lexicon_entry_t **out, size_t *count) {
    if (!lex || !token || !out || !count) return DC_ERR_NULL_PTR;
    *count = 0;
    size_t matches = 0;
    for (size_t i = 0; i < lex->count; i++) {
        if (lex->entries[i].token && strcmp(lex->entries[i].token, token) == 0) matches++;
    }
    if (matches == 0) { *out = NULL; return DC_OK; }
    dc_lexicon_entry_t *results = malloc(matches * sizeof(dc_lexicon_entry_t));
    if (!results) return DC_ERR_ALLOC;
    size_t idx = 0;
    for (size_t i = 0; i < lex->count; i++) {
        if (lex->entries[i].token && strcmp(lex->entries[i].token, token) == 0) {
            results[idx] = lex->entries[i];
            idx++;
        }
    }
    *out = results;
    *count = matches;
    return DC_OK;
}

dc_status_t dc_lexicon_to_json(const dc_lexicon *lex, char **json_out) {
    if (!lex || !json_out) return DC_ERR_NULL_PTR;
    size_t cap = 256 + lex->count * 256;
    char *buf = malloc(cap);
    if (!buf) return DC_ERR_ALLOC;
    size_t off = 0;
    off += (size_t)snprintf(buf + off, cap - off, "[");
    for (size_t i = 0; i < lex->count && off < cap - 256; i++) {
        off += (size_t)snprintf(buf + off, cap - off,
            "%s{\"token\":\"%s\",\"gloss\":\"%s\",\"pos\":\"%s\",\"confidence\":%.4f}",
            i > 0 ? "," : "",
            lex->entries[i].token ? lex->entries[i].token : "",
            lex->entries[i].gloss ? lex->entries[i].gloss : "",
            lex->entries[i].pos ? lex->entries[i].pos : "",
            lex->entries[i].confidence);
    }
    off += (size_t)snprintf(buf + off, cap - off, "]");
    *json_out = buf;
    return DC_OK;
}
