#include "dc_unicode.h"
#include <stdlib.h>
#include <string.h>

size_t dc_utf8_len(const char *s) {
    if (!s) return 0;
    size_t count = 0;
    while (*s) {
        if ((*s & 0xC0) != 0x80) count++;
        s++;
    }
    return count;
}

uint32_t dc_utf8_decode_char(const char *s, size_t *bytes_read) {
    if (!s || !bytes_read) return 0;
    const uint8_t *p = (const uint8_t *)s;
    uint32_t cp;

    if (p[0] < 0x80) {
        *bytes_read = 1;
        return p[0];
    } else if ((p[0] & 0xE0) == 0xC0) {
        *bytes_read = 2;
        cp = (uint32_t)(p[0] & 0x1F) << 6;
        cp |= (uint32_t)(p[1] & 0x3F);
        return cp;
    } else if ((p[0] & 0xF0) == 0xE0) {
        *bytes_read = 3;
        cp = (uint32_t)(p[0] & 0x0F) << 12;
        cp |= (uint32_t)(p[1] & 0x3F) << 6;
        cp |= (uint32_t)(p[2] & 0x3F);
        return cp;
    } else if ((p[0] & 0xF8) == 0xF0) {
        *bytes_read = 4;
        cp = (uint32_t)(p[0] & 0x07) << 18;
        cp |= (uint32_t)(p[1] & 0x3F) << 12;
        cp |= (uint32_t)(p[2] & 0x3F) << 6;
        cp |= (uint32_t)(p[3] & 0x3F);
        return cp;
    }
    *bytes_read = 1;
    return 0xFFFD; /* replacement char */
}

size_t dc_utf8_encode_char(uint32_t codepoint, char *out) {
    if (!out) return 0;
    if (codepoint < 0x80) {
        out[0] = (char)codepoint;
        return 1;
    } else if (codepoint < 0x800) {
        out[0] = (char)(0xC0 | (codepoint >> 6));
        out[1] = (char)(0x80 | (codepoint & 0x3F));
        return 2;
    } else if (codepoint < 0x10000) {
        out[0] = (char)(0xE0 | (codepoint >> 12));
        out[1] = (char)(0x80 | ((codepoint >> 6) & 0x3F));
        out[2] = (char)(0x80 | (codepoint & 0x3F));
        return 3;
    } else if (codepoint < 0x110000) {
        out[0] = (char)(0xF0 | (codepoint >> 18));
        out[1] = (char)(0x80 | ((codepoint >> 12) & 0x3F));
        out[2] = (char)(0x80 | ((codepoint >> 6) & 0x3F));
        out[3] = (char)(0x80 | (codepoint & 0x3F));
        return 4;
    }
    return 0;
}

bool dc_is_pua(uint32_t codepoint) {
    return (codepoint >= 0xE000 && codepoint <= 0xF8FF) ||
           (codepoint >= 0xF0000 && codepoint <= 0xFFFFD) ||
           (codepoint >= 0x100000 && codepoint <= 0x10FFFD);
}

dc_status_t dc_utf8_normalize_nfc(const char *in, char **out) {
    if (!in || !out) return DC_ERR_NULL_PTR;
    /* Simplified: for this application, most ancient scripts are in PUA or specific blocks */
    *out = strdup(in);
    return *out ? DC_OK : DC_ERR_ALLOC;
}
