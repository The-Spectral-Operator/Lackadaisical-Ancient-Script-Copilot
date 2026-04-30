#include "dc_log.h"
#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <string.h>

static FILE *g_log_file = NULL;
static dc_log_level_t g_min_level = DC_LOG_INFO;

static const char *level_str(dc_log_level_t level) {
    switch (level) {
        case DC_LOG_TRACE: return "TRC";
        case DC_LOG_DEBUG: return "DBG";
        case DC_LOG_INFO:  return "INF";
        case DC_LOG_WARN:  return "WRN";
        case DC_LOG_ERROR: return "ERR";
        case DC_LOG_FATAL: return "FTL";
        default: return "???";
    }
}

dc_status_t dc_log_init(const char *log_path, dc_log_level_t min_level) {
    g_min_level = min_level;
    if (log_path && strlen(log_path) > 0) {
        g_log_file = fopen(log_path, "a");
        if (!g_log_file) return DC_ERR_IO;
    }
    return DC_OK;
}

void dc_log_shutdown(void) {
    if (g_log_file) {
        fclose(g_log_file);
        g_log_file = NULL;
    }
}

void dc_log(dc_log_level_t level, const char *fmt, ...) {
    if (level < g_min_level) return;

    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char timebuf[32];
    strftime(timebuf, sizeof(timebuf), "%Y-%m-%dT%H:%M:%S", t);

    FILE *out = g_log_file ? g_log_file : stderr;
    fprintf(out, "[%s][%s] ", timebuf, level_str(level));

    va_list args;
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    va_end(args);

    fputc('\n', out);
    fflush(out);
}
