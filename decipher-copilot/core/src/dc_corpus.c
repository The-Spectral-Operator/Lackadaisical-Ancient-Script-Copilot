#include "dc_corpus.h"
#include "dc_stats.h"
#include <stdlib.h>
#include <string.h>

dc_status_t dc_corpus_create(dc_corpus **out) {
    if (!out) return DC_ERR_NULL_PTR;
    dc_corpus *c = calloc(1, sizeof(dc_corpus));
    if (!c) return DC_ERR_ALLOC;
    *out = c;
    return DC_OK;
}

dc_status_t dc_corpus_add_inscription(dc_corpus *corpus, const char *sign_sequence) {
    if (!corpus || !sign_sequence) return DC_ERR_NULL_PTR;

    /* Store the inscription */
    char **new_inscr = realloc(corpus->inscriptions, (corpus->inscription_count + 1) * sizeof(char *));
    if (!new_inscr) return DC_ERR_ALLOC;
    corpus->inscriptions = new_inscr;
    corpus->inscriptions[corpus->inscription_count] = strdup(sign_sequence);
    if (!corpus->inscriptions[corpus->inscription_count]) return DC_ERR_ALLOC;
    corpus->inscription_count++;

    /* Tokenize by spaces and add to token array */
    char *copy = strdup(sign_sequence);
    if (!copy) return DC_ERR_ALLOC;

    char *saveptr = NULL;
    char *tok = strtok_r(copy, " \t", &saveptr);
    while (tok) {
        char **new_tokens = realloc(corpus->tokens, (corpus->token_count + 1) * sizeof(char *));
        if (!new_tokens) { free(copy); return DC_ERR_ALLOC; }
        corpus->tokens = new_tokens;
        corpus->tokens[corpus->token_count] = strdup(tok);
        if (!corpus->tokens[corpus->token_count]) { free(copy); return DC_ERR_ALLOC; }
        corpus->token_count++;
        tok = strtok_r(NULL, " \t", &saveptr);
    }
    free(copy);
    return DC_OK;
}

dc_status_t dc_corpus_compute_frequencies(dc_corpus *corpus) {
    if (!corpus) return DC_ERR_NULL_PTR;
    dc_status_t s = dc_freq_unigram((const char **)corpus->tokens, corpus->token_count, &corpus->unigrams);
    if (s != DC_OK) return s;
    s = dc_freq_bigram((const char **)corpus->tokens, corpus->token_count, &corpus->bigrams);
    return s;
}

#ifndef _WIN32
/* POSIX strtok_r is already available */
#else
/* strtok_r may not be available on older MSVC */
#ifndef strtok_r
static char *strtok_r_impl(char *str, const char *delim, char **saveptr) {
    if (!str) str = *saveptr;
    str += strspn(str, delim);
    if (*str == '\0') { *saveptr = str; return NULL; }
    char *end = str + strcspn(str, delim);
    if (*end) { *end = '\0'; end++; }
    *saveptr = end;
    return str;
}
#define strtok_r strtok_r_impl
#endif
#endif
