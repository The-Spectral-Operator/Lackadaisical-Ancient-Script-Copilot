#ifndef DC_B64_H
#define DC_B64_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

dc_status_t dc_b64_encode_impl(const uint8_t *in, size_t in_len, char *out, size_t out_cap, size_t *written);
dc_status_t dc_b64_decode_impl(const char *in, size_t in_len, uint8_t *out, size_t out_cap, size_t *written);

#ifdef __cplusplus
}
#endif

#endif /* DC_B64_H */
