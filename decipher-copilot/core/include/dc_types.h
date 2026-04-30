#ifndef DC_TYPES_H
#define DC_TYPES_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef _WIN32
#  define DC_API __declspec(dllexport)
#else
#  define DC_API __attribute__((visibility("default")))
#endif

typedef enum {
    DC_OK = 0,
    DC_ERR_NULL_PTR = -1,
    DC_ERR_ALLOC = -2,
    DC_ERR_DB = -3,
    DC_ERR_PARSE = -4,
    DC_ERR_IO = -5,
    DC_ERR_INVALID_ARG = -6,
    DC_ERR_OVERFLOW = -7,
    DC_ERR_NOT_FOUND = -8,
    DC_ERR_INTERNAL = -9
} dc_status_t;

typedef struct {
    char *sign_id;
    uint64_t count;
} dc_freq_entry_t;

typedef struct {
    dc_freq_entry_t *entries;
    size_t count;
    size_t capacity;
} dc_freq_table_t;

typedef struct {
    char *sign_a;
    char *sign_b;
    uint64_t count;
} dc_bigram_entry_t;

typedef struct {
    dc_bigram_entry_t *entries;
    size_t count;
    size_t capacity;
} dc_bigram_table_t;

typedef struct {
    double slope;
    double r_squared;
    double ks_statistic;
    double ks_p_value;
} dc_zipf_result_t;

typedef struct {
    char *token;
    char *gloss;
    char *pos;
    double confidence;
    char *source;
    char *notes;
} dc_lexicon_entry_t;

#endif /* DC_TYPES_H */
