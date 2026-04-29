#include "../include/dc_db.h"
#include <stdio.h>
#include <assert.h>

int main(void) {
    printf("test_db: starting...\n");

    dc_db *db = NULL;
    dc_status_t s = dc_db_init("/tmp/test_decipher.db", "deadbeef", &db);
    assert(s == DC_OK);
    assert(db != NULL);

    s = dc_db_exec(db, "SELECT 1");
    assert(s == DC_OK);

    s = dc_db_checkpoint(db);
    assert(s == DC_OK);

    s = dc_db_close_handle(db);
    assert(s == DC_OK);

    printf("test_db: PASSED\n");
    return 0;
}
