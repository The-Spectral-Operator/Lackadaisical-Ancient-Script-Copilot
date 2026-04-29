#include "Corpus.hpp"
#include "Engine.hpp"
#include <cstdlib>

extern "C" {
#include "dc_api.h"
}

namespace decipher {

std::expected<Corpus, Error> Corpus::from_json(const std::string& json) {
    dc_corpus* raw = nullptr;
    dc_status_t s = dc_corpus_load_json(nullptr, json.c_str(), json.size(), &raw);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return Corpus(raw);
}

Corpus::~Corpus() {
    if (m_corpus) dc_corpus_free(m_corpus);
}

Corpus::Corpus(Corpus&& other) noexcept : m_corpus(other.m_corpus) {
    other.m_corpus = nullptr;
}

Corpus& Corpus::operator=(Corpus&& other) noexcept {
    if (this != &other) {
        if (m_corpus) dc_corpus_free(m_corpus);
        m_corpus = other.m_corpus;
        other.m_corpus = nullptr;
    }
    return *this;
}

std::expected<std::string, Error> Corpus::unigram_json() const {
    char* json = nullptr;
    dc_status_t s = dc_corpus_unigram(m_corpus, &json);
    if (s != DC_OK) return std::unexpected(from_status(s));
    std::string result(json);
    dc_free(json);
    return result;
}

std::expected<std::string, Error> Corpus::bigram_json() const {
    char* json = nullptr;
    dc_status_t s = dc_corpus_bigram(m_corpus, &json);
    if (s != DC_OK) return std::unexpected(from_status(s));
    std::string result(json);
    dc_free(json);
    return result;
}

std::expected<std::string, Error> Corpus::zipf_json() const {
    char* json = nullptr;
    dc_status_t s = dc_corpus_zipf(m_corpus, &json);
    if (s != DC_OK) return std::unexpected(from_status(s));
    std::string result(json);
    dc_free(json);
    return result;
}

std::expected<double, Error> Corpus::shannon() const {
    double h;
    dc_status_t s = dc_corpus_shannon(m_corpus, &h);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return h;
}

std::expected<double, Error> Corpus::cond_entropy() const {
    double h;
    dc_status_t s = dc_corpus_cond_entropy(m_corpus, &h);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return h;
}

std::expected<double, Error> Corpus::renyi(double alpha) const {
    double h;
    dc_status_t s = dc_corpus_renyi(m_corpus, alpha, &h);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return h;
}

std::expected<double, Error> Corpus::yule_k() const {
    double k;
    dc_status_t s = dc_corpus_yule_k(m_corpus, &k);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return k;
}

} // namespace decipher
