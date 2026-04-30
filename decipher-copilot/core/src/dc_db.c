#include "dc_db.h"
#include "dc_log.h"
#include <stdlib.h>
#include <string.h>

#ifdef DC_HAS_SQLITE3MC
#include "sqlite3mc.h"
#else
/* Forward declarations when building without vendored sqlite3mc */
typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;
extern int sqlite3_open_v2(const char*, sqlite3**, int, const char*);
extern int sqlite3_close_v2(sqlite3*);
extern int sqlite3_exec(sqlite3*, const char*, void*, void*, char**);
extern void sqlite3_free(void*);
#define SQLITE_OK 0
#define SQLITE_OPEN_READWRITE 0x00000002
#define SQLITE_OPEN_CREATE    0x00000004
#define SQLITE_OPEN_FULLMUTEX 0x00010000
#define SQLITE_OPEN_URI       0x00000040
#endif

struct dc_db {
    sqlite3 *handle;
    char *path;
};

dc_status_t dc_db_init(const char *path, const char *hex_key, dc_db **out) {
    if (!path || !hex_key || !out) return DC_ERR_NULL_PTR;

    dc_db *db = calloc(1, sizeof(dc_db));
    if (!db) return DC_ERR_ALLOC;

    db->path = strdup(path);
    if (!db->path) {
        free(db);
        return DC_ERR_ALLOC;
    }

    int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_URI;
    int rc = sqlite3_open_v2(path, &db->handle, flags, NULL);
    if (rc != SQLITE_OK) {
        DC_LOG_E("db: failed to open %s (rc=%d)", path, rc);
        free(db->path);
        free(db);
        return DC_ERR_DB_OPEN;
    }

    /* Apply SQLCipher key via PRAGMA */
    char key_pragma[256];
    snprintf(key_pragma, sizeof(key_pragma), "PRAGMA key=\"x'%s'\";", hex_key);
    char *err_msg = NULL;
    rc = sqlite3_exec(db->handle, key_pragma, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        DC_LOG_E("db: key pragma failed for %s: %s", path, err_msg ? err_msg : "unknown");
        if (err_msg) sqlite3_free(err_msg);
        sqlite3_close_v2(db->handle);
        free(db->path);
        free(db);
        return DC_ERR_DB_KEY;
    }

    /* Apply required WAL and performance pragmas */
    const char *pragmas[] = {
        "PRAGMA cipher='sqlcipher';",
        "PRAGMA legacy=4;",
        "PRAGMA journal_mode=WAL;",
        "PRAGMA synchronous=NORMAL;",
        "PRAGMA foreign_keys=ON;",
        "PRAGMA temp_store=MEMORY;",
        "PRAGMA mmap_size=268435456;",
        "PRAGMA cache_size=-65536;",
        "PRAGMA busy_timeout=5000;",
        NULL
    };

    for (const char **p = pragmas; *p; p++) {
        rc = sqlite3_exec(db->handle, *p, NULL, NULL, &err_msg);
        if (rc != SQLITE_OK) {
            DC_LOG_W("db: pragma warning on %s: %s (non-fatal)", path, err_msg ? err_msg : "");
            if (err_msg) { sqlite3_free(err_msg); err_msg = NULL; }
        }
    }

    DC_LOG_I("db: opened %s (WAL, encrypted)", path);
    *out = db;
    return DC_OK;
}

dc_status_t dc_db_close_handle(dc_db *db) {
    if (!db) return DC_ERR_NULL_PTR;
    if (db->handle) {
        sqlite3_close_v2(db->handle);
        db->handle = NULL;
    }
    free(db->path);
    free(db);
    return DC_OK;
}

dc_status_t dc_db_exec(dc_db *db, const char *sql) {
    if (!db || !sql) return DC_ERR_NULL_PTR;
    if (!db->handle) return DC_ERR_DB_CLOSED;

    char *err_msg = NULL;
    int rc = sqlite3_exec(db->handle, sql, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        DC_LOG_E("db: exec failed: %s", err_msg ? err_msg : "unknown error");
        if (err_msg) sqlite3_free(err_msg);
        return DC_ERR_DB_EXEC;
    }
    return DC_OK;
}

dc_status_t dc_db_checkpoint(dc_db *db) {
    if (!db) return DC_ERR_NULL_PTR;
    if (!db->handle) return DC_ERR_DB_CLOSED;

    DC_LOG_D("db: checkpoint requested for %s", db->path);
    int rc = sqlite3_exec(db->handle, "PRAGMA wal_checkpoint(RESTART);", NULL, NULL, NULL);
    if (rc != SQLITE_OK) {
        DC_LOG_W("db: checkpoint failed for %s (rc=%d, non-fatal)", db->path, rc);
        return DC_ERR_DB_EXEC;
    }
    return DC_OK;
}

sqlite3 *dc_db_get_handle(dc_db *db) {
    return db ? db->handle : NULL;
}
