#ifndef DC_SHA256_H
#define DC_SHA256_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t state[8];
    uint64_t bitlen;
    uint8_t data[64];
    uint32_t datalen;
} dc_sha256_ctx_t;

dc_status_t dc_sha256_init(dc_sha256_ctx_t *ctx);
dc_status_t dc_sha256_update(dc_sha256_ctx_t *ctx, const uint8_t *data, size_t len);
dc_status_t dc_sha256_final(dc_sha256_ctx_t *ctx, uint8_t hash[32]);
dc_status_t dc_sha256_impl(const void *data, size_t n, uint8_t out32[32]);

#ifdef __cplusplus
}
#endif

#endif /* DC_SHA256_H */
