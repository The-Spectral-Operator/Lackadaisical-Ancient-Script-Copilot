#include "../include/dc_align.h"
#include "../include/dc_corpus.h"
#include "../include/dc_stats.h"
#include <stdio.h>
#include <assert.h>

int main(void) {
    printf("test_align: starting...\n");

    dc_corpus *corpus;
    dc_status_t s = dc_corpus_create(&corpus);
    assert(s == DC_OK);

    dc_corpus_add_inscription(corpus, "A B C A B");
    dc_corpus_add_inscription(corpus, "B C D A");
    dc_corpus_add_inscription(corpus, "A A B C");
    dc_corpus_compute_frequencies(corpus);

    dc_anneal_params_t params = {
        .initial_temp = 50.0,
        .cooling_rate = 0.99,
        .max_iterations = 1000,
        .seed = 42
    };

    dc_align_result_t result = {0};
    s = dc_align_coupled_anneal(corpus, NULL, 0, &params, &result);
    assert(s == DC_OK);
    assert(result.count > 0);
    printf("  alignments found: %zu\n", result.count);
    printf("  iterations used: %zu\n", result.iterations_used);

    char *json = NULL;
    s = dc_align_result_to_json(&result, &json);
    assert(s == DC_OK);
    assert(json != NULL);
    printf("  result JSON length: %zu\n", strlen(json));
    free(json);

    dc_align_result_free(&result);
    dc_corpus_free(corpus);
    printf("test_align: PASSED\n");
    return 0;
}
