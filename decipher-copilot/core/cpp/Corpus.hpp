#pragma once
#include <string>
#include <expected>
#include <vector>

extern "C" {
#include "dc_corpus.h"
}

namespace decipher {

class Corpus {
public:
    static std::expected<Corpus, Error> from_json(const std::string& json);
    ~Corpus();
    Corpus(Corpus&&) noexcept;
    Corpus& operator=(Corpus&&) noexcept;

    std::expected<std::string, Error> unigram_json() const;
    std::expected<std::string, Error> bigram_json() const;
    std::expected<std::string, Error> zipf_json() const;
    std::expected<double, Error> shannon() const;
    std::expected<double, Error> cond_entropy() const;
    std::expected<double, Error> renyi(double alpha) const;
    std::expected<double, Error> yule_k() const;

    dc_corpus* raw() const { return m_corpus; }

private:
    explicit Corpus(dc_corpus* c) : m_corpus(c) {}
    dc_corpus* m_corpus = nullptr;
};

} // namespace decipher
