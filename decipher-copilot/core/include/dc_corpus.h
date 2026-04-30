#ifndef DC_CORPUS_H
#define DC_CORPUS_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

struct dc_corpus {
    char **tokens;
    size_t token_count;
    char **inscriptions;
    size_t inscription_count;
    dc_freq_table_t unigrams;
    dc_bigram_table_t bigrams;
};

dc_status_t dc_corpus_create(dc_corpus **out);
dc_status_t dc_corpus_add_inscription(dc_corpus *corpus, const char *sign_sequence);
dc_status_t dc_corpus_compute_frequencies(dc_corpus *corpus);

#ifdef __cplusplus
}
#endif

#endif /* DC_CORPUS_H */
