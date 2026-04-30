#ifndef DC_ENTROPY_H
#define DC_ENTROPY_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

dc_status_t dc_shannon_entropy(const dc_freq_table_t *freq, size_t total_tokens, double *out_h);
dc_status_t dc_conditional_entropy(const char **tokens, size_t n, double *out_h);
dc_status_t dc_block_entropy(const char **tokens, size_t n, size_t block_size, double *out_h);
dc_status_t dc_renyi_entropy(const dc_freq_table_t *freq, size_t total_tokens, double alpha, double *out);
dc_status_t dc_yule_k(const dc_freq_table_t *freq, size_t total_tokens, double *out_k);
dc_status_t dc_simpson_d(const dc_freq_table_t *freq, size_t total_tokens, double *out_d);

#ifdef __cplusplus
}
#endif

#endif /* DC_ENTROPY_H */
