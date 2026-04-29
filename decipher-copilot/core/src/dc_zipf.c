#include "dc_zipf.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

dc_status_t dc_zipf_fit(const dc_freq_table_t *freq, dc_zipf_result_t *out) {
    if (!freq || !out) return DC_ERR_NULL_PTR;
    if (freq->count < 2) {
        memset(out, 0, sizeof(*out));
        return DC_OK;
    }

    /* Linear regression on log(rank) vs log(freq) */
    double sum_x = 0.0, sum_y = 0.0, sum_xy = 0.0, sum_x2 = 0.0, sum_y2 = 0.0;
    size_t n = freq->count;

    for (size_t i = 0; i < n; i++) {
        double x = log((double)(i + 1));
        double y = log((double)freq->entries[i].count);
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_x2 += x * x;
        sum_y2 += y * y;
    }

    double dn = (double)n;
    double denom = dn * sum_x2 - sum_x * sum_x;
    if (fabs(denom) < 1e-15) {
        memset(out, 0, sizeof(*out));
        return DC_OK;
    }

    out->slope = (dn * sum_xy - sum_x * sum_y) / denom;
    double intercept = (sum_y - out->slope * sum_x) / dn;
    (void)intercept;

    /* R-squared */
    double ss_tot = sum_y2 - (sum_y * sum_y) / dn;
    double ss_res = 0.0;
    for (size_t i = 0; i < n; i++) {
        double x = log((double)(i + 1));
        double y = log((double)freq->entries[i].count);
        double y_pred = out->slope * x + (sum_y - out->slope * sum_x) / dn;
        double residual = y - y_pred;
        ss_res += residual * residual;
    }
    out->r_squared = (ss_tot > 1e-15) ? 1.0 - ss_res / ss_tot : 0.0;

    /* KS test: compare empirical CDF to theoretical Zipf CDF */
    double total = 0.0;
    for (size_t i = 0; i < n; i++) total += (double)freq->entries[i].count;

    double ks_max = 0.0;
    double cum_empirical = 0.0;
    double harmonic = 0.0;
    double s = -out->slope;
    for (size_t i = 0; i < n; i++) harmonic += pow((double)(i + 1), -s);

    double cum_theoretical = 0.0;
    for (size_t i = 0; i < n; i++) {
        cum_empirical += (double)freq->entries[i].count / total;
        cum_theoretical += pow((double)(i + 1), -s) / harmonic;
        double diff = fabs(cum_empirical - cum_theoretical);
        if (diff > ks_max) ks_max = diff;
    }
    out->ks_statistic = ks_max;
    /* Approximate p-value using Kolmogorov distribution */
    double sqrt_n = sqrt(dn);
    double lambda = (sqrt_n + 0.12 + 0.11 / sqrt_n) * ks_max;
    out->ks_p_value = 2.0 * exp(-2.0 * lambda * lambda);
    if (out->ks_p_value > 1.0) out->ks_p_value = 1.0;
    if (out->ks_p_value < 0.0) out->ks_p_value = 0.0;

    return DC_OK;
}

dc_status_t dc_zipf_ks_test(const dc_freq_table_t *freq, double slope, double *ks_stat, double *p_value) {
    if (!freq || !ks_stat || !p_value) return DC_ERR_NULL_PTR;
    dc_zipf_result_t result;
    result.slope = slope;
    dc_status_t s = dc_zipf_fit(freq, &result);
    if (s != DC_OK) return s;
    *ks_stat = result.ks_statistic;
    *p_value = result.ks_p_value;
    return DC_OK;
}
