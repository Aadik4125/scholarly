# Training data

All sources are public. Raw files go in `data/raw/` (gitignored). `prepare.py` builds everything
in `data/processed/`.

| Source | License | What we use | How it's fetched |
|---|---|---|---|
| [MAGE](https://huggingface.co/datasets/yaful/MAGE) (Li et al., 2024) | Apache-2.0 | 10 domains (cmv, eli5, hswag, roct, sci_gen, squad, tldr, wp, xsum, yelp) × 27 generators in 8 families (OpenAI GPT-3.5/davinci, LLaMA-1, GLM-130B, BLOOM, FLAN-T5, GPT-J/NeoX, OPT, T0). The OOD GPT-4 sets are kept as an external test. | full CSVs (≈550 MB) |
| [RAID](https://huggingface.co/datasets/liamdugan/raid) (Dugan et al., 2024) | MIT | 8 domains (abstracts, books, news, poetry, recipes, reddit, reviews, wiki) × 11 generators (GPT-2/3/4, ChatGPT, Cohere(+chat), Llama-2-chat, Mistral(+chat), MPT(+chat)); 11 adversarial attacks used for robustness tests only | `fetch_raid.py` samples byte ranges of the 11.7 GB CSV (≈370 MB), then tops up human rows |
| [HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3) (Guo et al., 2023) | CC-BY-SA-4.0 | Human vs ChatGPT answers (finance, medicine, open_qa, reddit_eli5, wiki_csai) | `all.jsonl` |
| [arXiv abstracts 2021](https://huggingface.co/datasets/gfissore/arxiv-abstracts-2021) | CC0-1.0 | Abstracts from 2007–08: guaranteed human-written academic text. 3,000 are held back as the false-positive audit set. | first 40 MB of the gzip |

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

## Known limitations
- The newest generators are GPT-4 (2023), Llama-2-chat and Mistral-7B. There is nothing from 2024–26 (GPT-4o/5, Claude 3+, Gemini, Llama 3+, Qwen). Topping up with modern generations is the most valuable data improvement left.
- Human academic text is mostly abstracts, not full paper sections (methods, results).
- English only.
