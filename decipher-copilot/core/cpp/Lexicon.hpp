#pragma once
#include <string>
#include <expected>
#include <vector>

extern "C" {
#include "dc_lexicon.h"
}

namespace decipher {

class Lexicon {
public:
    static std::expected<Lexicon, Error> create();
    ~Lexicon();
    Lexicon(Lexicon&&) noexcept;
    Lexicon& operator=(Lexicon&&) noexcept;

    std::expected<void, Error> add(const std::string& token, const std::string& gloss,
                                    const std::string& pos, double confidence);
    std::expected<std::string, Error> to_json() const;

private:
    explicit Lexicon(dc_lexicon* l) : m_lex(l) {}
    dc_lexicon* m_lex = nullptr;
};

} // namespace decipher
