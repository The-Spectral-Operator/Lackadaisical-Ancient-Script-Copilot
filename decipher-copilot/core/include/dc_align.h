#ifndef DC_ALIGN_H
#define DC_ALIGN_H

#include "dc_types.h"
#include "dc_corpus.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    double initial_temp;
    double cooling_rate;
    size_t max_iterations;
    uint32_t seed;
} dc_anneal_params_t;

typedef struct {
    char *source_sign;
    char *target_reading;
    double score;
} dc_alignment_t;

typedef struct {
    dc_alignment_t *alignments;
    size_t count;
    double total_score;
    size_t iterations_used;
} dc_align_result_t;

dc_status_t dc_align_coupled_anneal(
    const dc_corpus *corpus,
    const dc_lexicon_entry_t *known_entries, size_t known_count,
    const dc_anneal_params_t *params,
    dc_align_result_t *out);

dc_status_t dc_align_result_free(dc_align_result_t *result);
dc_status_t dc_align_result_to_json(const dc_align_result_t *result, char **json_out);

#ifdef __cplusplus
}
#endif

#endif /* DC_ALIGN_H */
