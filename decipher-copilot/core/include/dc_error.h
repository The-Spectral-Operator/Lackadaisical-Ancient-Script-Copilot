#ifndef DC_ERROR_H
#define DC_ERROR_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

const char *dc_status_string(dc_status_t status);
void dc_set_last_error(const char *fmt, ...);
const char *dc_get_last_error(void);
void dc_clear_last_error(void);

#ifdef __cplusplus
}
#endif

#endif /* DC_ERROR_H */
