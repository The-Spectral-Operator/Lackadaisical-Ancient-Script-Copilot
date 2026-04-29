#include "dc_b64.h"
#include <string.h>

static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

dc_status_t dc_b64_encode_impl(const uint8_t *in, size_t in_len, char *out, size_t out_cap, size_t *written) {
    if (!in || !out || !written) return DC_ERR_NULL_PTR;
    size_t needed = ((in_len + 2) / 3) * 4 + 1;
    if (out_cap < needed) return DC_ERR_OVERFLOW;

    size_t j = 0;
    for (size_t i = 0; i < in_len; i += 3) {
        uint32_t octet_a = in[i];
        uint32_t octet_b = (i + 1 < in_len) ? in[i + 1] : 0;
        uint32_t octet_c = (i + 2 < in_len) ? in[i + 2] : 0;
        uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

        out[j++] = b64_table[(triple >> 18) & 0x3F];
        out[j++] = b64_table[(triple >> 12) & 0x3F];
        out[j++] = (i + 1 < in_len) ? b64_table[(triple >> 6) & 0x3F] : '=';
        out[j++] = (i + 2 < in_len) ? b64_table[triple & 0x3F] : '=';
    }
    out[j] = '\0';
    *written = j;
    return DC_OK;
}

static int b64_decode_char(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

dc_status_t dc_b64_decode_impl(const char *in, size_t in_len, uint8_t *out, size_t out_cap, size_t *written) {
    if (!in || !out || !written) return DC_ERR_NULL_PTR;
    if (in_len % 4 != 0) return DC_ERR_INVALID_ARG;

    size_t needed = (in_len / 4) * 3;
    if (in_len > 0 && in[in_len - 1] == '=') needed--;
    if (in_len > 1 && in[in_len - 2] == '=') needed--;
    if (out_cap < needed) return DC_ERR_OVERFLOW;

    size_t j = 0;
    for (size_t i = 0; i < in_len; i += 4) {
        int a = b64_decode_char(in[i]);
        int b = b64_decode_char(in[i + 1]);
        int c = (in[i + 2] == '=') ? 0 : b64_decode_char(in[i + 2]);
        int d = (in[i + 3] == '=') ? 0 : b64_decode_char(in[i + 3]);
        if (a < 0 || b < 0 || c < 0 || d < 0) return DC_ERR_PARSE;

        uint32_t triple = ((uint32_t)a << 18) | ((uint32_t)b << 12) | ((uint32_t)c << 6) | (uint32_t)d;
        if (j < needed) out[j++] = (uint8_t)((triple >> 16) & 0xFF);
        if (j < needed) out[j++] = (uint8_t)((triple >> 8) & 0xFF);
        if (j < needed) out[j++] = (uint8_t)(triple & 0xFF);
    }
    *written = j;
    return DC_OK;
}
