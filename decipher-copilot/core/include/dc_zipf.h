#ifndef DC_ZIPF_H
#define DC_ZIPF_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

dc_status_t dc_zipf_fit(const dc_freq_table_t *freq, dc_zipf_result_t *out);
dc_status_t dc_zipf_ks_test(const dc_freq_table_t *freq, double slope, double *ks_stat, double *p_value);

#ifdef __cplusplus
}
#endif

#endif /* DC_ZIPF_H */
