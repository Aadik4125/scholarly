import numpy as np
import pandas as pd
import pytest

from detector.data.prepare import _mage_generator, assign_groups, clean, clip_words
from detector.data.splits import BUILDERS, check_no_leak
from detector.features import linguistic
from detector.features.text import analyzer, normalize, sentence_spans, windows, words


def test_sentence_spans_cover_sentences():
    t = normalize("First one.  Second one? Third!   Fourth without stop")
    spans = sentence_spans(t)
    assert [t[a:b] for a, b in spans] == ["First one.", "Second one?", "Third!", "Fourth without stop"]


def test_windows():
    assert windows(0) == []
    assert windows(2) == [(0, 2)]
    assert windows(5) == [(0, 3), (1, 4), (2, 5)]


def test_words_and_analyzer():
    assert words("It's a Test-case, 42!") == ["it's", "a", "test", "case", "42"]
    feats = analyzer("Hi there")
    assert "w:hi" in feats and "w:hi there" in feats and "c: hi" in feats and "c:ere " in feats


def test_clean_undoes_tokenizer_artifacts():
    assert clean("It 's fine , I do n't know ( really ) .") == "It's fine, I don't know (really)."


def test_clip_words_ends_on_sentence():
    text = " ".join(["word"] * 10 + ["end."] + ["more"] * 600 + ["stop."])
    out = clip_words(text, 50)
    assert out.endswith("end.")


def test_mage_generator_parsing():
    assert _mage_generator("cmv_human") == ("cmv", "")
    assert _mage_generator("sci_gen_machine_continuation_65B") == ("sci_gen", "llama/65B")
    assert _mage_generator("xsum_machine_topical_gpt-3.5-trubo") == ("xsum", "openai/gpt-3.5-trubo")


def test_linguistic_feature_length():
    f = linguistic.extract(normalize("This is a sentence. Here is another one, with a comma; and more."))
    assert len(f) == len(linguistic.FEATURE_NAMES)
    assert all(np.isfinite(f))


def test_groups_link_continuations_and_sources():
    base = "the quick brown fox jumps over the lazy dog again and again today " * 3
    df = pd.DataFrame(
        {
            "text": [base + "human ending", base + "machine ending", "unrelated text " * 20, "x " * 30],
            "source_id": ["", "", "s1", "s1"],
        }
    )
    df["prefix"] = df["text"].map(lambda t: " ".join(t.split()[:12]))
    g = assign_groups(df)
    assert g[0] == g[1] and g[2] == g[3] and g[0] != g[2]


@pytest.mark.parametrize("name", list(BUILDERS))
def test_splits_have_no_group_leak(name):
    rng = np.random.default_rng(0)
    n = 400
    df = pd.DataFrame(
        {
            "text_id": [f"t{i}" for i in range(n)],
            "label": rng.integers(0, 2, n),
            "split_group": [f"g{i // 3}" for i in range(n)],
            "domain": rng.choice(["abstracts", "poetry", "news", "wp"], n),
            "generator": rng.choice(["mistral/mistral", "openai/gpt4", "llama/llama-chat"], n),
        }
    )
    df.loc[df.label == 0, "generator"] = ""
    part = BUILDERS[name](df, 1)
    check_no_leak(df, part)
    assert {"train", "test"} <= set(part.unique())
