#ifndef DC_API_H
#define DC_API_H

#include "dc_types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct dc_engine dc_engine;
typedef struct dc_corpus dc_corpus;

DC_API int  dc_init(const char *log_path);
DC_API void dc_shutdown(void);

DC_API int  dc_db_open(const char *db_path, const char *hex_key, dc_engine **out);
DC_API void dc_db_close(dc_engine *engine);

DC_API int  dc_corpus_load_json(dc_engine *engine, const char *json_utf8, size_t len, dc_corpus **out);
DC_API void dc_corpus_free(dc_corpus *corpus);
DC_API int  dc_corpus_unigram(const dc_corpus *corpus, char **json_out);
DC_API int  dc_corpus_bigram(const dc_corpus *corpus, char **json_out);
DC_API int  dc_corpus_trigram(const dc_corpus *corpus, char **json_out);
DC_API int  dc_corpus_zipf(const dc_corpus *corpus, char **json_out);
DC_API int  dc_corpus_shannon(const dc_corpus *corpus, double *out_h);
DC_API int  dc_corpus_cond_entropy(const dc_corpus *corpus, double *out_h);
DC_API int  dc_corpus_renyi(const dc_corpus *corpus, double alpha, double *out);
DC_API int  dc_corpus_yule_k(const dc_corpus *corpus, double *out_k);
DC_API int  dc_align_anneal(const dc_corpus *corpus, const char *known_lexicon_json,
                            const char *params_json, char **result_json);

DC_API int  dc_sha256(const void *data, size_t n, uint8_t out32[32]);
DC_API int  dc_b64_encode(const void *in, size_t n, char *out, size_t out_cap, size_t *written);
DC_API int  dc_b64_decode(const char *in, size_t n, uint8_t *out, size_t out_cap, size_t *written);

DC_API void dc_free(void *p);

#ifdef __cplusplus
}
#endif

#endif /* DC_API_H */
