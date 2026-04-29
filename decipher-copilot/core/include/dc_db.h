#ifndef DC_DB_H
#define DC_DB_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct dc_db dc_db;

dc_status_t dc_db_init(const char *path, const char *hex_key, dc_db **out);
dc_status_t dc_db_close_handle(dc_db *db);
dc_status_t dc_db_exec(dc_db *db, const char *sql);
dc_status_t dc_db_checkpoint(dc_db *db);

#ifdef __cplusplus
}
#endif

#endif /* DC_DB_H */
