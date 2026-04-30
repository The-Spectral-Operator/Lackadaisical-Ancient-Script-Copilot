#include "dc_error.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

static char g_last_error[1024] = "";

const char *dc_status_string(dc_status_t status) {
    switch (status) {
        case DC_OK:              return "OK";
        case DC_ERR_NULL_PTR:    return "null pointer";
        case DC_ERR_ALLOC:       return "allocation failed";
        case DC_ERR_DB:          return "database error";
        case DC_ERR_PARSE:       return "parse error";
        case DC_ERR_IO:          return "I/O error";
        case DC_ERR_INVALID_ARG: return "invalid argument";
        case DC_ERR_OVERFLOW:    return "overflow";
        case DC_ERR_NOT_FOUND:   return "not found";
        case DC_ERR_INTERNAL:    return "internal error";
        default:                 return "unknown error";
    }
}

void dc_set_last_error(const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vsnprintf(g_last_error, sizeof(g_last_error), fmt, args);
    va_end(args);
}

const char *dc_get_last_error(void) {
    return g_last_error;
}

void dc_clear_last_error(void) {
    g_last_error[0] = '\0';
}
