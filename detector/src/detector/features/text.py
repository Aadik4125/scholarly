"""Shared text spec: normalization, sentence splitting, windowing and tokenization.

This module is the contract between training (Python) and inference (Node,
server/aiDetector/text.js). Every function here has an exact JS twin, checked by the parity
fixtures. Keep it simple and ASCII-safe on purpose: if you change anything here, change the JS
port too and regenerate the fixtures.
"""

from __future__ import annotations

import re
import unicodedata

WINDOW_SIZE = 3  # sentences per scoring window (stride 1)

# Explicit whitespace class: Python's \s and JS's \s disagree on a few code points.
WS_CODEPOINTS = (0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0x85, 0xA0, 0x1680,
                 *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)
WS_CLASS = "[" + re.escape("".join(map(chr, WS_CODEPOINTS))) + "]"
_WS = re.compile(WS_CLASS + "+")
# Same rule as the server's existing sentence split: break after . ! ? followed by whitespace.
# Normalized text only contains single spaces.
_SENT_BREAK = re.compile(r"(?<=[.!?]) ")
_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


def normalize(text: str) -> str:
    """NFKC, curly quotes to straight, collapse whitespace, trim."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return _WS.sub(" ", text).strip()


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """[start, end) offsets of each sentence in `text` (expects normalized text)."""
    spans = []
    pos = 0
    for m in _SENT_BREAK.finditer(text):
        if m.start() > pos:
            spans.append((pos, m.start()))
        pos = m.end()
    if pos < len(text):
        spans.append((pos, len(text)))
    return spans


def windows(n_sentences: int, size: int = WINDOW_SIZE) -> list[tuple[int, int]]:
    """Sentence-index ranges [i, j) of each scoring window. Short texts get a single window."""
    if n_sentences <= 0:
        return []
    if n_sentences <= size:
        return [(0, n_sentences)]
    return [(i, i + size) for i in range(n_sentences - size + 1)]


def words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def analyzer(text: str) -> list[str]:
    """Features for TF-IDF: word 1-2 grams ("w:") and char 3-5 grams inside padded words ("c:")."""
    toks = words(text)
    feats = ["w:" + t for t in toks]
    feats += ["w:" + toks[i] + " " + toks[i + 1] for i in range(len(toks) - 1)]
    for t in toks:
        padded = " " + t + " "
        for n in (3, 4, 5):
            if len(padded) < n:
                break
            feats += ["c:" + padded[i : i + n] for i in range(len(padded) - n + 1)]
    return feats
