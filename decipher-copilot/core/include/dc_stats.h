#ifndef DC_STATS_H
#define DC_STATS_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

dc_status_t dc_freq_unigram(const char **tokens, size_t n, dc_freq_table_t *out);
dc_status_t dc_freq_bigram(const char **tokens, size_t n, dc_bigram_table_t *out);
dc_status_t dc_freq_positional(const char **tokens, size_t n, bool line_initial, char **json_out);
dc_status_t dc_freq_table_free(dc_freq_table_t *table);
dc_status_t dc_bigram_table_free(dc_bigram_table_t *table);

#ifdef __cplusplus
}
#endif

#endif /* DC_STATS_H */
