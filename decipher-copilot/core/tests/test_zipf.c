#include "../include/dc_api.h"
#include "../include/dc_zipf.h"
#include "../include/dc_stats.h"
#include <stdio.h>
#include <assert.h>

int main(void) {
    printf("test_zipf: starting...\n");

    /* Create a Zipfian-like distribution */
    const char *tokens[] = {
        "A","A","A","A","A","A","A","A","A","A",
        "B","B","B","B","B",
        "C","C","C",
        "D","D",
        "E"
    };
    size_t n = 21;

    dc_freq_table_t freq = {0};
    dc_status_t s = dc_freq_unigram(tokens, n, &freq);
    assert(s == DC_OK);

    dc_zipf_result_t result;
    s = dc_zipf_fit(&freq, &result);
    assert(s == DC_OK);
    printf("  slope = %.4f\n", result.slope);
    printf("  R² = %.4f\n", result.r_squared);
    printf("  KS stat = %.4f\n", result.ks_statistic);
    printf("  KS p-value = %.4f\n", result.ks_p_value);

    /* Slope should be negative for Zipfian distribution */
    assert(result.slope < 0.0);
    assert(result.r_squared > 0.8);

    dc_freq_table_free(&freq);
    printf("test_zipf: PASSED\n");
    return 0;
}
