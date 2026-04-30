#ifndef DC_LEXICON_H
#define DC_LEXICON_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct dc_lexicon dc_lexicon;

dc_status_t dc_lexicon_create(dc_lexicon **out);
dc_status_t dc_lexicon_free(dc_lexicon *lex);
dc_status_t dc_lexicon_add_entry(dc_lexicon *lex, const dc_lexicon_entry_t *entry);
dc_status_t dc_lexicon_lookup(const dc_lexicon *lex, const char *token, dc_lexicon_entry_t **out, size_t *count);
dc_status_t dc_lexicon_to_json(const dc_lexicon *lex, char **json_out);

#ifdef __cplusplus
}
#endif

#endif /* DC_LEXICON_H */
