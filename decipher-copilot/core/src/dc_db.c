#include "dc_db.h"
#include "dc_log.h"
#include <stdlib.h>
#include <string.h>

struct dc_db {
    void *handle; /* sqlite3* - opaque here for portability without vendored headers */
    char *path;
};

dc_status_t dc_db_init(const char *path, const char *hex_key, dc_db **out) {
    if (!path || !hex_key || !out) return DC_ERR_NULL_PTR;
    dc_db *db = calloc(1, sizeof(dc_db));
    if (!db) return DC_ERR_ALLOC;
    db->path = strdup(path);
    /* In full build, this opens sqlite3 with encryption key. */
    /* For now, this is a stub that creates the structure. */
    DC_LOG_I("db: opened %s", path);
    *out = db;
    return DC_OK;
}

dc_status_t dc_db_close_handle(dc_db *db) {
    if (!db) return DC_ERR_NULL_PTR;
    free(db->path);
    free(db);
    return DC_OK;
}

dc_status_t dc_db_exec(dc_db *db, const char *sql) {
    if (!db || !sql) return DC_ERR_NULL_PTR;
    /* Stub: in production this calls sqlite3_exec */
    (void)sql;
    return DC_OK;
}

dc_status_t dc_db_checkpoint(dc_db *db) {
    if (!db) return DC_ERR_NULL_PTR;
    DC_LOG_D("db: checkpoint requested for %s", db->path);
    return DC_OK;
}
