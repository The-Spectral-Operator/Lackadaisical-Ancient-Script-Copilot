#ifndef DC_UNICODE_H
#define DC_UNICODE_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

size_t dc_utf8_len(const char *s);
uint32_t dc_utf8_decode_char(const char *s, size_t *bytes_read);
size_t dc_utf8_encode_char(uint32_t codepoint, char *out);
bool dc_is_pua(uint32_t codepoint);
dc_status_t dc_utf8_normalize_nfc(const char *in, char **out);

#ifdef __cplusplus
}
#endif

#endif /* DC_UNICODE_H */
