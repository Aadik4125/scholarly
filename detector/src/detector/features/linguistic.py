"""Compact stylometric features. Plain Python on purpose: server/aiDetector/features.js is an
exact port, checked by the parity fixtures. Input is normalized text (text.normalize)."""

from __future__ import annotations

import math

from .text import sentence_spans, words

FUNCTION_WORDS = (
    "the", "of", "and", "to", "a", "in", "is", "that", "for", "it", "as", "with", "be", "on",
    "this", "by", "are", "or", "which", "we", "not", "but", "can", "also", "however", "these",
)

FEATURE_NAMES = (
    "log_word_count",
    "sent_len_mean",
    "sent_len_std",
    "sent_len_cv",
    "type_token_ratio",
    "mattr_50",
    "mean_word_len",
    "long_word_rate",
    "comma_rate",
    "semicolon_rate",
    "colon_rate",
    "dash_rate",
    "paren_rate",
    "question_rate",
    "digit_rate",
    "repeat_bigram_rate",
    "repeat_trigram_rate",
    "function_word_rate",
) + tuple("fw_" + w for w in FUNCTION_WORDS)


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs):
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _repeat_rate(toks, n):
    grams = [" ".join(toks[i : i + n]) for i in range(len(toks) - n + 1)]
    if not grams:
        return 0.0
    return 1.0 - len(set(grams)) / len(grams)


def _mattr(toks, w=50):
    """Moving-average type-token ratio; plain TTR when the text is shorter than the window."""
    if len(toks) <= w:
        return len(set(toks)) / len(toks) if toks else 0.0
    counts: dict[str, int] = {}
    for t in toks[:w]:
        counts[t] = counts.get(t, 0) + 1
    total = len(counts)
    for i in range(w, len(toks)):
        out, inn = toks[i - w], toks[i]
        counts[out] -= 1
        if counts[out] == 0:
            del counts[out]
        counts[inn] = counts.get(inn, 0) + 1
        total += len(counts)
    return total / (len(toks) - w + 1)


def extract(text: str) -> list[float]:
    toks = words(text)
    n = len(toks)
    nw = max(n, 1)
    nc = max(len(text.encode("utf-16-le")) // 2, 1)  # UTF-16 length, to match JS string.length
    sent_lens = [len(words(text[a:b])) for a, b in sentence_spans(text)]
    sent_lens = [x for x in sent_lens if x > 0]
    m = _mean(sent_lens)
    s = _std(sent_lens)
    fw_counts = {w: 0 for w in FUNCTION_WORDS}
    for t in toks:
        if t in fw_counts:
            fw_counts[t] += 1
    feats = [
        math.log1p(n),
        m,
        s,
        s / m if m else 0.0,
        len(set(toks)) / nw,
        _mattr(toks),
        _mean([len(t) for t in toks]),
        sum(1 for t in toks if len(t) >= 9) / nw,
        text.count(",") / nw,
        text.count(";") / nw,
        text.count(":") / nw,
        (text.count("-") + text.count("—") + text.count("–")) / nw,
        text.count("(") / nw,
        text.count("?") / nw,
        sum(1 for ch in text if "0" <= ch <= "9") / nc,  # ASCII only, to match JS
        _repeat_rate(toks, 2),
        _repeat_rate(toks, 3),
        sum(fw_counts.values()) / nw,
    ]
    feats += [fw_counts[w] / nw for w in FUNCTION_WORDS]
    return feats
