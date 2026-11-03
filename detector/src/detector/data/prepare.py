"""Build the training corpus from the raw downloads.

Outputs (data/processed/):
  corpus.parquet          main pool that splits.py partitions
  audit.parquet           held-back human academic text (arXiv 2007-08), never trained on
  raid_attacks.parquet    RAID adversarial variants (paraphrase, homoglyph, ...) for robustness
  mage_ood.parquet        MAGE's own out-of-distribution GPT-4 test sets (+ paraphrased)

Labels: 0 = human, 1 = AI (MAGE uses the opposite convention; it is flipped here).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from datasketch import MinHash, MinHashLSH

from ..features.text import normalize, sentence_spans

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

MIN_WORDS = 50
MAX_WORDS = 500
COLUMNS = ["text_id", "text", "label", "domain", "origin", "generator", "attack", "source_id", "word_count"]

csv.field_size_limit(sys.maxsize)

# ---------------------------------------------------------------------------- cleaning

_DETOK = [
    (re.compile(r" ([,.;:!?%)\]}])"), r"\1"),
    (re.compile(r"([(\[{$]) "), r"\1"),
    (re.compile(r" (n't|'s|'re|'ve|'ll|'d|'m)\b", re.I), r"\1"),
    (re.compile(r" ' "), "'"),
    (re.compile(r"(\w) - (\w)"), r"\1-\2"),
    (re.compile(r'" (.*?) "'), r'"\1"'),
]


def clean(text: str) -> str:
    """Normalize and undo tokenizer artifacts present in several source corpora. Applied to both
    classes so spacing quirks cannot become a shortcut feature."""
    text = normalize(text)
    for pat, rep in _DETOK:
        text = pat.sub(rep, text)
    return text


def clip_words(text: str, max_words: int = MAX_WORDS) -> str:
    """Truncate to roughly max_words, ending on a sentence boundary."""
    out_end = 0
    count = 0
    for a, b in sentence_spans(text):
        count += len(text[a:b].split())
        if count > max_words and out_end:
            break
        out_end = b
    return text[:out_end]


def _hash(*parts: str) -> str:
    return hashlib.sha1("\x1f".join(parts).encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------- loaders

MAGE_FAMILIES = [
    (re.compile(r"^(7B|13B|30B|65B)$"), "llama"),
    (re.compile(r"^GLM"), "glm"),
    (re.compile(r"^bloom"), "bloom"),
    (re.compile(r"^flan_t5"), "flan_t5"),
    (re.compile(r"^(gpt-3.5|text-davinci)"), "openai"),
    (re.compile(r"^(gpt_j|gpt_neox)"), "eleuther"),
    (re.compile(r"^opt"), "opt"),
    (re.compile(r"^t0"), "t0"),
]


def _mage_generator(src: str) -> tuple[str, str]:
    """'xsum_machine_topical_gpt-3.5-trubo' -> ('xsum', 'openai/gpt-3.5-trubo')."""
    if src.endswith("_human"):
        return src[: -len("_human")], ""
    domain, _, rest = src.partition("_machine_")
    _, _, model = rest.partition("_")  # drop prompt style: continuation / specified / topical
    fam = next((f for pat, f in MAGE_FAMILIES if pat.search(model)), "other")
    return domain, f"{fam}/{model}"


def load_mage(files=("train.csv", "valid.csv", "test.csv"), origin="mage") -> pd.DataFrame:
    frames = []
    for name in files:
        df = pd.read_csv(RAW / "mage" / name, encoding="utf-8-sig", engine="python")
        df = df.dropna(subset=["text", "src"])
        parsed = df["src"].map(_mage_generator)
        is_human = df["src"].str.endswith("_human")
        mage_label = df["label"].astype(int)
        # Sanity check the flipped convention against the src names.
        assert ((mage_label == 1) == is_human).mean() > 0.99, "MAGE label convention changed"
        frames.append(
            pd.DataFrame(
                {
                    "text": df["text"].astype(str),
                    "label": (~is_human).astype(int),
                    "domain": parsed.str[0],
                    "origin": origin,
                    "generator": parsed.str[1],
                    "attack": "paraphrase" if "para" in name else "none",
                    "source_id": "",
                }
            )
        )
    return pd.concat(frames, ignore_index=True)


def load_hc3() -> pd.DataFrame:
    rows = []
    with (RAW / "hc3" / "all.jsonl").open() as f:
        for line in f:
            d = json.loads(line)
            sid = "hc3:" + _hash(d["question"])
            domain = "hc3_" + d.get("source", "unknown")
            for t in d.get("human_answers") or []:
                rows.append((t, 0, domain, "hc3", "", "none", sid))
            for t in d.get("chatgpt_answers") or []:
                rows.append((t, 1, domain, "hc3", "openai/chatgpt", "none", sid))
    return pd.DataFrame(rows, columns=["text", "label", "domain", "origin", "generator", "attack", "source_id"])


def load_arxiv() -> pd.DataFrame:
    rows = []
    try:
        with gzip.open(RAW / "arxiv" / "head.jsonl.gz", "rt") as f:
            for line in f:
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    break  # truncated last line of the partial download
                rows.append((d["abstract"], 0, "abstracts", "arxiv", "", "none", "arxiv:" + d["id"]))
    except EOFError:
        pass  # partial gzip download
    return pd.DataFrame(rows, columns=["text", "label", "domain", "origin", "generator", "attack", "source_id"])


RAID_FAMILIES = {
    "gpt2": "openai", "gpt3": "openai", "gpt4": "openai", "chatgpt": "openai",
    "cohere": "cohere", "cohere-chat": "cohere", "llama-chat": "llama",
    "mistral": "mistral", "mistral-chat": "mistral", "mpt": "mpt", "mpt-chat": "mpt",
}


def load_raid() -> pd.DataFrame:
    parts = [RAW / "raid" / "slices.csv", RAW / "raid" / "humans.csv"]
    df = pd.concat(
        [pd.read_csv(p, dtype=str, keep_default_na=False, engine="python") for p in parts if p.exists()],
        ignore_index=True,
    ).drop_duplicates("id")
    is_human = df["model"] == "human"
    return pd.DataFrame(
        {
            "text": df["generation"],
            "label": (~is_human).astype(int),
            "domain": df["domain"],
            "origin": "raid",
            "generator": np.where(is_human, "", df["model"].map(lambda m: f"{RAID_FAMILIES.get(m, 'other')}/{m}")),
            "attack": df["attack"],
            # source_id ties every generation (and attack) back to its human document.
            "source_id": "raid:" + df["source_id"],
        }
    )


# ---------------------------------------------------------------------------- grouping


class _UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


_LATEX_MATH = re.compile(r"\$+([^$]{1,200}?)\$+")
_LATEX_CMD = re.compile(r"\\(?:mathrm|mathbf|mathit|text|operatorname|left|right|,|;|!)\s*")


def strip_latex(text: str) -> str:
    """Inline LaTeX ($L_{EQ}(n)$) as plain text. Some models write math as LaTeX while text taken
    from PDFs or Word files never contains it, so it would be a formatting shortcut."""
    def plain(m: re.Match) -> str:
        t = _LATEX_CMD.sub("", m.group(1))
        t = re.sub(r"\\([A-Za-z]+)", r"\1", t)
        return re.sub(r"[{}_^]", "", t)
    return _LATEX_MATH.sub(plain, text)


_REFUSAL = re.compile(r"^(i('m| am) (sorry|unable)|i can(no|')t (help|write|assist))", re.I)


def _family(model: str) -> str:
    return "anthropic" if model.startswith("claude") else "openai"


def load_modern() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Paper sections from current models and the human sections they imitate (see
    detector.data.modern). Returns (corpus rows, held-out-generator test rows, human audit rows)."""
    base = RAW / "modern"
    if not (base / "sections.jsonl").exists():
        empty = pd.DataFrame(columns=["text", "label", "domain", "origin", "generator", "attack", "source_id"])
        return empty, empty.copy(), empty.copy()
    sections = {r["idx"]: r for r in map(json.loads, open(base / "sections.jsonl"))}
    ai = {}
    for name in ("ai_claude.jsonl", "ai_openai.jsonl"):
        if (base / name).exists():
            for r in map(json.loads, open(base / name)):
                ai[r["idx"]] = r
    rows = {"corpus": [], "ood": [], "audit": []}
    dropped = 0
    for idx, s in sections.items():
        human = strip_latex(s["human"])
        rows[s["role"]].append((human, 0, "paper_sections", "modern", "", "none", s["paper_id"]))
        if s["role"] == "audit":
            continue
        out = ai.get(idx)
        if out is None:
            continue
        text = strip_latex(_clean_ai(out["text"]))
        if out.get("finish") not in ("end_turn", "stop") or len(text.split()) < 100 or _REFUSAL.match(text):
            dropped += 1
            continue
        rows[s["role"]].append((text, 1, "paper_sections", "modern", f"{_family(out['generator'])}/{out['generator']}", "none", s["paper_id"]))
    # Data-grounded sections (detector.data.grounded): a second section per paper, written by a
    # model from factual notes taken from the real section, so the AI text carries the same
    # numbers and citations. Same paper id, so it stays in the same split group.
    if (base / "grounded.jsonl").exists() and (base / "ai_grounded.jsonl").exists():
        gsec = {r["idx"]: r for r in map(json.loads, open(base / "grounded.jsonl"))}
        gai = {r["idx"]: r for r in map(json.loads, open(base / "ai_grounded.jsonl"))}
        kept = 0
        for idx, g in gsec.items():
            out = gai.get(idx)
            if out is None:
                continue
            text = strip_latex(_clean_ai(out["text"]))
            if out.get("finish") not in ("end_turn", "stop") or len(text.split()) < 100 or _REFUSAL.match(text):
                dropped += 1
                continue
            rows[g["role"]].append((strip_latex(g["human"]), 0, "paper_sections", "modern", "", "none", g["paper_id"]))
            rows[g["role"]].append((text, 1, "paper_sections", "modern", f"{_family(out['generator'])}/{out['generator']}", "none", g["paper_id"]))
            kept += 1
        print(f"modern: added {kept} data-grounded pairs", file=sys.stderr)
    print(f"modern: dropped {dropped} unusable generations", file=sys.stderr)
    cols = ["text", "label", "domain", "origin", "generator", "attack", "source_id"]
    return tuple(pd.DataFrame(rows[k], columns=cols) for k in ("corpus", "ood", "audit"))


def _clean_ai(text: str) -> str:
    from detector.data.modern import clean_output

    return clean_output(text)


def assign_groups(df: pd.DataFrame, lsh_threshold: float = 0.7) -> pd.Series:
    """split_group = connected components over (same source_id) OR (same opening words, which
    catches MAGE continuations of a human prefix) OR (MinHash near-duplicates)."""
    n = len(df)
    uf = _UnionFind(n)
    for key in ("source_id", "prefix"):
        first: dict[str, int] = {}
        for i, k in enumerate(df[key].tolist()):
            if not k:
                continue
            if k in first:
                uf.union(first[k], i)
            else:
                first[k] = i

    lsh = MinHashLSH(threshold=lsh_threshold, num_perm=64)
    for i, text in enumerate(df["text"].tolist()):
        toks = text.lower().split()
        sh = {" ".join(toks[j : j + 5]) for j in range(max(1, len(toks) - 4))}
        m = MinHash(num_perm=64)
        m.update_batch([s.encode() for s in sh])
        for j in lsh.query(m):
            uf.union(i, j)
        lsh.insert(i, m)
        if i % 20000 == 0:
            print(f"  minhash {i}/{n}", file=sys.stderr)
    return pd.Series([f"g{uf.find(i)}" for i in range(n)], index=df.index)


# ---------------------------------------------------------------------------- pipeline


def finalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["text"] = df["text"].map(clean).map(clip_words)
    df["word_count"] = df["text"].str.split().str.len()
    df = df[df["word_count"] >= MIN_WORDS]
    df = df.drop_duplicates(subset="text")
    df["text_id"] = [_hash(o, t) for o, t in zip(df["origin"], df["text"])]
    return df[COLUMNS].reset_index(drop=True)


DOMAIN_CAP = {"paper_sections": 2}


def balance(df: pd.DataFrame, max_per_cell: int, seed: int) -> pd.DataFrame:
    """Within each domain, downsample so neither class exceeds the other by more than 20% and no
    (domain, label, generator) cell exceeds max_per_cell."""
    # Human text has a single "generator" cell per domain while AI text is spread over many, so
    # human cells get a larger cap. The target domain (paper sections, the thing the app
    # actually scores) gets a larger cap again, so none of it is discarded to match domains
    # that only exist to teach general authorship.
    parts = []
    for (domain, label, _), g in df.groupby(["domain", "label", "generator"]):
        cap = max_per_cell * (4 if label == 0 else 1) * DOMAIN_CAP.get(domain, 1)
        parts.append(g.sample(min(len(g), cap), random_state=seed))
    df = pd.concat(parts)
    out = []
    for _, g in df.groupby("domain"):
        h, a = g[g.label == 0], g[g.label == 1]
        if len(h) == 0 or len(a) == 0:
            continue  # single-class domains teach topic, not authorship
        cap = int(min(len(h), len(a)) * 1.2)
        out += [h.sample(min(len(h), cap), random_state=seed), a.sample(min(len(a), cap), random_state=seed)]
    return pd.concat(out, ignore_index=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--max-per-cell", type=int, default=800, help="max docs per (domain, label, generator)")
    ap.add_argument("--audit-size", type=int, default=3000)
    ap.add_argument("--arxiv-train", type=int, default=6000)
    ap.add_argument("--no-hc3", action="store_true", help="exclude HC3 (CC-BY-SA share-alike)")
    args = ap.parse_args()
    PROCESSED.mkdir(parents=True, exist_ok=True)

    print("loading...", file=sys.stderr)
    mage = load_mage()
    hc3 = load_hc3() if not args.no_hc3 else pd.DataFrame(columns=["text", "label", "domain", "origin", "generator", "attack", "source_id"])
    arxiv = load_arxiv().sample(frac=1.0, random_state=args.seed)
    raid = load_raid()
    modern, modern_ood, modern_audit = load_modern()
    print(f"mage={len(mage)} hc3={len(hc3)} arxiv={len(arxiv)} raid={len(raid)} modern={len(modern)}", file=sys.stderr)

    # Held-back sets first, so nothing in them can reach the corpus.
    audit = finalize(arxiv.iloc[: args.audit_size])
    audit.to_parquet(PROCESSED / "audit.parquet", index=False)
    arxiv_train = arxiv.iloc[args.audit_size : args.audit_size + args.arxiv_train]

    attacks = finalize(raid[raid["attack"] != "none"])
    mage_ood = finalize(load_mage(("test_ood_set_gpt.csv", "test_ood_set_gpt_para.csv"), origin="mage_ood"))
    # Current models never trained on (Claude Sonnet 5.5, GPT-5.5) with their human sections, and
    # extra human paper sections: the tests that matter most for student papers today.
    modern_ood = finalize(modern_ood)
    modern_audit = finalize(modern_audit)

    pool = pd.concat([mage, hc3, arxiv_train, raid[raid["attack"] == "none"], modern], ignore_index=True)
    pool = finalize(pool)
    # Drop anything that also appears in a held-back set.
    held = set(audit["text"]) | set(mage_ood["text"]) | set(modern_ood["text"]) | set(modern_audit["text"])
    pool = pool[~pool["text"].isin(held)]
    corpus = balance(pool, args.max_per_cell, args.seed)

    corpus["prefix"] = corpus["text"].map(lambda t: " ".join(t.lower().split()[:12]))
    print(f"grouping {len(corpus)} docs...", file=sys.stderr)
    corpus["split_group"] = assign_groups(corpus)
    corpus = corpus.drop(columns="prefix")

    # Attack variants share groups with their RAID source document (used to keep them out of
    # training if a robustness run needs it).
    gmap = corpus.loc[corpus["source_id"] != ""].drop_duplicates("source_id").set_index("source_id")["split_group"]
    attacks["split_group"] = attacks["source_id"].map(gmap).fillna("")

    corpus.to_parquet(PROCESSED / "corpus.parquet", index=False)
    attacks.to_parquet(PROCESSED / "raid_attacks.parquet", index=False)
    mage_ood.to_parquet(PROCESSED / "mage_ood.parquet", index=False)
    modern_ood.to_parquet(PROCESSED / "modern_ood.parquet", index=False)
    modern_audit.to_parquet(PROCESSED / "modern_audit.parquet", index=False)

    print(f"\ncorpus: {len(corpus)} docs, {corpus['split_group'].nunique()} groups")
    print(corpus.groupby(["origin", "label"]).size().unstack(fill_value=0))
    print("\nby domain:\n", corpus.groupby(["domain", "label"]).size().unstack(fill_value=0))
    print(f"\naudit={len(audit)} attacks={len(attacks)} mage_ood={len(mage_ood)}")


if __name__ == "__main__":
    main()
