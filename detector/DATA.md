# Training data

All sources are public. Raw files go in `data/raw/` (gitignored). `prepare.py` builds everything
in `data/processed/`.

| Source | License | What we use | How it's fetched |
|---|---|---|---|
| [MAGE](https://huggingface.co/datasets/yaful/MAGE) (Li et al., 2024) | Apache-2.0 | 10 domains (cmv, eli5, hswag, roct, sci_gen, squad, tldr, wp, xsum, yelp) × 27 generators in 8 families (OpenAI GPT-3.5/davinci, LLaMA-1, GLM-130B, BLOOM, FLAN-T5, GPT-J/NeoX, OPT, T0). The OOD GPT-4 sets are kept as an external test. | full CSVs (≈550 MB) |
| [RAID](https://huggingface.co/datasets/liamdugan/raid) (Dugan et al., 2024) | MIT | 8 domains (abstracts, books, news, poetry, recipes, reddit, reviews, wiki) × 11 generators (GPT-2/3/4, ChatGPT, Cohere(+chat), Llama-2-chat, Mistral(+chat), MPT(+chat)); 11 adversarial attacks used for robustness tests only | `fetch_raid.py` samples byte ranges of the 11.7 GB CSV (≈370 MB), then tops up human rows |
| [HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3) (Guo et al., 2023) | CC-BY-SA-4.0 | Human vs ChatGPT answers (finance, medicine, open_qa, reddit_eli5, wiki_csai) | `all.jsonl` |
| [arXiv abstracts 2021](https://huggingface.co/datasets/gfissore/arxiv-abstracts-2021) | CC0-1.0 | Abstracts from 2007–08: guaranteed human-written academic text. 3,000 are held back as the false-positive audit set. | first 40 MB of the gzip |

| [peS2o v2](https://huggingface.co/datasets/allenai/peS2o) (Soldaini & Lo, 2023) | ODC-BY-1.0 | Full-text papers created 2021 or earlier (so written before ChatGPT), all fields. One body section per paper (Introduction, Methods, Results, Discussion, Conclusion…), clipped to about 450 words. | first 2,500 lines of v2 train shards 10, 14 and 18 → `raw/pes2o/fulltext.jsonl` |
| Modern generations (ours) | generated | For each peS2o section, a current model writes the same section of the same paper (title, heading and abstract as context) or rewrites the human section. Tasks: write 35%, student request 20%, "make it sound human" 15%, polish 30%. Models: Claude Sonnet 5, Haiku 5.5, Haiku 4.5, Opus 5.5; GPT-4o, GPT-4o-mini, GPT-5-mini. **Held out, never trained on:** Claude Sonnet 5.5 and GPT-5.5. | `python -m detector.data.modern select / generate / collect` (Claude via the Message Batches API) → `raw/modern/` |

**HC3 license note:** HC3 is share-alike (CC-BY-SA). If model weights trained on it count as an
adaptation, they would inherit the license. If that matters for distribution, retrain with
`--no-hc3`; MAGE and RAID cover the same ground.

## Labels and cleaning
- `label`: 0 = human, 1 = AI. MAGE stores the opposite convention, and `prepare.py` flips it (asserted against the `src` names).
- `clean()` undoes tokenizer artifacts (`do n't`, ` ,`, `( x )`) in **both** classes. HC3 and parts of MAGE carry them on the human side only, which would hand the model a spacing shortcut.
- Documents under 50 words are dropped. Longer ones are clipped to about 500 words at a sentence boundary. Exact duplicates are removed.
- **Balance:** within each domain, neither class exceeds the other by more than 20%. Each (domain, generator) cell is capped at 800 docs, or 3,200 for human cells. Single-class domains are dropped, because they would teach topic rather than authorship.

## Leakage control
`split_group` is a connected component over:
1. the same `source_id` (a RAID human doc with all of its generations and attacks; an HC3 question with all of its answers),
2. the same first 12 words (MAGE "continuation" generations start with the human prefix),
3. MinHash near-duplicates (Jaccard ≥ 0.7 on word 5-shingles).

Splits never put a group on two sides. `tests/test_text_and_splits.py` checks this.

## Splits (`data/splits/`)
| Split | Test set |
|---|---|
| `random` | grouped 80/10/10 |
| `ood_generator` | all Mistral / Mistral-chat text (RAID). Note: test also contains other generators that share a RAID source group; filter to `generator` starting `mistral/` for the pure unseen-generator number. |
| `ood_domain_creative` | poetry, recipes, wp, roct |
| `ood_domain_academic` | abstracts, sci_gen, hc3_wiki_csai: does training on everything else transfer to papers? |

Held-out sets, never in any split: `audit.parquet` (human academic), `mage_ood.parquet` (GPT-4, plain + paraphrased), `raid_attacks.parquet`.

Held-out modern sets (built in `prepare.py`, never in any split): `modern_ood.parquet` (Sonnet 5.5 and
GPT-5.5 sections with their human sections) and `modern_audit.parquet` (800 human paper sections).
Inline LaTeX is converted to plain text in both classes, since uploaded PDFs and Word files never
contain it. Training the transformer always includes every modern text (`--keep-origin modern`).

## Known limitations
- Modern generations cover Claude and GPT only: no Gemini, Llama 3+, Qwen or DeepSeek.
- Modern human sections are mostly Introductions and Discussions (the headings papers use most).
- English only.
