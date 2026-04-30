#ifndef DC_LOG_H
#define DC_LOG_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    DC_LOG_TRACE = 0,
    DC_LOG_DEBUG = 1,
    DC_LOG_INFO  = 2,
    DC_LOG_WARN  = 3,
    DC_LOG_ERROR = 4,
    DC_LOG_FATAL = 5
} dc_log_level_t;

dc_status_t dc_log_init(const char *log_path, dc_log_level_t min_level);
void dc_log_shutdown(void);
void dc_log(dc_log_level_t level, const char *fmt, ...);

#define DC_LOG_T(...) dc_log(DC_LOG_TRACE, __VA_ARGS__)
#define DC_LOG_D(...) dc_log(DC_LOG_DEBUG, __VA_ARGS__)
#define DC_LOG_I(...) dc_log(DC_LOG_INFO,  __VA_ARGS__)
#define DC_LOG_W(...) dc_log(DC_LOG_WARN,  __VA_ARGS__)
#define DC_LOG_E(...) dc_log(DC_LOG_ERROR, __VA_ARGS__)
#define DC_LOG_F(...) dc_log(DC_LOG_FATAL, __VA_ARGS__)

#ifdef __cplusplus
}
#endif

#endif /* DC_LOG_H */
