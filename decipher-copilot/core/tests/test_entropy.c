#include "../include/dc_api.h"
#include "../include/dc_entropy.h"
#include "../include/dc_stats.h"
#include <stdio.h>
#include <math.h>
#include <assert.h>

int main(void) {
    printf("test_entropy: starting...\n");

    /* Create a simple frequency table */
    const char *tokens[] = {"A", "B", "A", "C", "A", "B", "D", "A"};
    size_t n = 8;

    dc_freq_table_t freq = {0};
    dc_status_t s = dc_freq_unigram(tokens, n, &freq);
    assert(s == DC_OK);
    assert(freq.count == 4); /* A, B, C, D */

    /* Shannon entropy */
    double h;
    s = dc_shannon_entropy(&freq, n, &h);
    assert(s == DC_OK);
    assert(h > 1.5 && h < 2.1); /* Expected ~1.75 bits */
    printf("  Shannon H1 = %.4f (expected ~1.75)\n", h);

    /* Conditional entropy */
    double h2;
    s = dc_conditional_entropy(tokens, n, &h2);
    assert(s == DC_OK);
    assert(h2 >= 0.0);
    printf("  Conditional H2 = %.4f\n", h2);

    /* Renyi entropy (alpha=2) */
    double r;
    s = dc_renyi_entropy(&freq, n, 2.0, &r);
    assert(s == DC_OK);
    assert(r > 0.0 && r <= h); /* Renyi alpha>1 should be <= Shannon */
    printf("  Renyi H2 = %.4f\n", r);

    /* Yule's K */
    double k;
    s = dc_yule_k(&freq, n, &k);
    assert(s == DC_OK);
    assert(k >= 0.0);
    printf("  Yule's K = %.4f\n", k);

    dc_freq_table_free(&freq);
    printf("test_entropy: PASSED\n");
    return 0;
}
