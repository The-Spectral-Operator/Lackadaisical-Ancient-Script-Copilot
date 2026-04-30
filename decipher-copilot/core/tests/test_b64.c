#include "../include/dc_b64.h"
#include <stdio.h>
#include <string.h>
#include <assert.h>

int main(void) {
    printf("test_b64: starting...\n");

    /* Encode "Hello" -> "SGVsbG8=" */
    char encoded[64];
    size_t written;
    dc_status_t s = dc_b64_encode_impl((const uint8_t *)"Hello", 5, encoded, 64, &written);
    assert(s == DC_OK);
    assert(strcmp(encoded, "SGVsbG8=") == 0);
    printf("  encode('Hello') = '%s'\n", encoded);

    /* Decode back */
    uint8_t decoded[64];
    size_t dec_written;
    s = dc_b64_decode_impl("SGVsbG8=", 8, decoded, 64, &dec_written);
    assert(s == DC_OK);
    assert(dec_written == 5);
    assert(memcmp(decoded, "Hello", 5) == 0);
    printf("  decode('SGVsbG8=') = 'Hello'\n");

    /* Empty */
    s = dc_b64_encode_impl((const uint8_t *)"", 0, encoded, 64, &written);
    assert(s == DC_OK);
    assert(written == 0);

    printf("test_b64: PASSED\n");
    return 0;
}
