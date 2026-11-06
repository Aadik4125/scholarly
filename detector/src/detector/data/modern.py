"""Modern AI-text data: paper sections written by 2024-26 models (Claude 4.5-5.5, GPT-4o-5.5),
paired with the human-written section they imitate.

The original corpus stops at GPT-4 / Llama-2 (2023), and its human academic text is mostly
abstracts. Detectors trained on it miss most text from current models. This module builds:

  sections.jsonl      one human section per paper (peS2o full texts created <= 2021, so
                      written before ChatGPT), with the model and task assigned to imitate it
  ai_claude.jsonl     Claude outputs (Message Batches API, half price)
  ai_openai.jsonl     GPT outputs (Chat Completions, resumable)

Each AI text imitates one human section from the same paper (same title, same heading, the
paper's abstract as context) or rewrites it ("polish"), so topic can't separate the classes.
Roles: `corpus` pairs go into training/val/test; `ood` pairs come from two held-out models and
are never trained on; `audit` sections are extra human text for the false-positive audit.

  python -m detector.data.modern select
  python -m detector.data.modern pilot            # a few live calls per model, prints samples
  python -m detector.data.modern generate         # submits Claude batch, runs GPT calls
  python -m detector.data.modern collect          # downloads finished Claude batch results
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
OUT = RAW / "modern"
SECTIONS = OUT / "sections.jsonl"

# (generator, provider, count, role). `ood` generators are held out of training entirely.
PLAN = [
    ("claude-sonnet-5", "anthropic", 900, "corpus"),
    ("claude-haiku-5-5", "anthropic", 900, "corpus"),
    ("claude-haiku-4-5", "anthropic", 500, "corpus"),
    ("claude-opus-5-5", "anthropic", 300, "corpus"),
    ("gpt-4o-mini", "openai", 300, "corpus"),
    ("gpt-5-mini", "openai", 300, "corpus"),
    ("gpt-4o", "openai", 250, "corpus"),
    ("claude-sonnet-5-5", "anthropic", 400, "ood"),
    ("gpt-5.5", "openai", 200, "ood"),
]
AUDIT_SECTIONS = 800

TASKS = {"write": 0.35, "student": 0.20, "humanize": 0.15, "polish": 0.30}

HEADING_OK = re.compile(
    r"^(\d+(\.\d+)*\.?\s*)?(introduction|background|related work|literature review|methods?|methodology|"
    r"materials and methods|experimental( setup)?|experiments?|results?|discussion|results and discussion|"
    r"conclusions?|analysis|evaluation|findings|limitations|implications|overview|motivation|approach)\b",
    re.I,
)
SENT_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")


def clip_sentences(text: str, max_words: int) -> str:
    out, n = [], 0
    for s in SENT_END.split(text.strip()):
        w = len(s.split())
        if n + w > max_words and out:
            break
        out.append(s)
        n += w
    return " ".join(out)


def pick_section(doc: dict, rng: random.Random) -> dict | None:
    paras = doc["text"].split("\n\n")
    if len(paras) < 4:
        return None
    title = paras[0].strip()
    abstract = clip_sentences(paras[1].replace("\n", " "), 160)
    options = []
    for p in paras[2:]:
        head, _, body = p.strip().partition("\n")
        body = " ".join(body.split())
        if 0 < len(head) <= 80 and HEADING_OK.search(head.strip()) and len(body.split()) >= 180:
            options.append((head.strip(), body))
    if not options or len(title.split()) < 3 or len(abstract.split()) < 40:
        return None
    head, body = rng.choice(options)
    human = clip_sentences(body, 450)
    if len(human.split()) < 150:
        return None
    return {"paper_id": doc["id"], "created": doc["created"], "title": title, "heading": head, "abstract": abstract, "human": human}


def select(seed: int = 13) -> None:
    rng = random.Random(seed)
    docs = [json.loads(line) for line in open(RAW / "pes2o" / "fulltext.jsonl")]
    rng.shuffle(docs)
    sections = [s for d in docs if (s := pick_section(d, rng))]
    print(f"{len(sections)} usable sections from {len(docs)} papers", file=sys.stderr)
    slots = [(g, prov, role) for g, prov, n, role in PLAN for _ in range(n)]
    need = len(slots) + AUDIT_SECTIONS
    if len(sections) < need:
        raise SystemExit(f"need {need} sections, have {len(sections)}")
    rng.shuffle(slots)
    task_names, weights = zip(*TASKS.items())
    OUT.mkdir(parents=True, exist_ok=True)
    with open(SECTIONS, "w") as f:
        for i, s in enumerate(sections[:need]):
            if i < len(slots):
                gen, prov, role = slots[i]
                s.update(idx=i, role=role, generator=gen, provider=prov, task=rng.choices(task_names, weights)[0])
            else:
                s.update(idx=i, role="audit", generator="", provider="", task="")
            f.write(json.dumps(s) + "\n")
    print(f"wrote {need} sections to {SECTIONS}", file=sys.stderr)


KINDS = ["final-year project report", "master's thesis", "term paper", "journal article", "conference paper"]


def prompt_for(s: dict) -> str:
    n = max(150, min(450, len(s["human"].split())))
    rng = random.Random(s["idx"])
    if s["task"] == "polish":
        return (
            "Improve the academic writing of the following section from a research paper. Keep the meaning and "
            "technical details, but make it clearer and better written. Output only the rewritten text, with no "
            f"heading, no bullet points and no commentary.\n\n{s['human']}"
        )
    if s["task"] == "student":
        return (
            f"I'm writing my {rng.choice(KINDS)} titled \"{s['title']}\". Can you write the {s['heading']} part for "
            f"me? About {n} words, paragraphs only, no headings, bullet points or markdown. Just give me the text.\n\n"
            f"Abstract for context: {s['abstract']}"
        )
    base = (
        f"Write the \"{s['heading']}\" section of a research paper titled \"{s['title']}\".\n\n"
        f"For context, here is the paper's abstract:\n{s['abstract']}\n\n"
        f"Write about {n} words of plain prose in an academic style: no headings, no bullet points, no markdown. "
        "Output only the section text."
    )
    if s["task"] == "humanize":
        base += " Make it read as if a person wrote it: vary sentence length and avoid typical AI phrasing."
    return base


def claude_params(s: dict) -> dict:
    p = {"model": s["generator"], "max_tokens": 6000, "messages": [{"role": "user", "content": prompt_for(s)}]}
    if s["generator"] != "claude-haiku-4-5":
        p["output_config"] = {"effort": "low"}  # these think by default; low effort keeps cost down
    return p


def openai_kwargs(s: dict) -> dict:
    kw = {"model": s["generator"], "messages": [{"role": "user", "content": prompt_for(s)}]}
    if s["generator"].startswith("gpt-5"):
        kw.update(max_completion_tokens=6000, reasoning_effort="low")
    else:
        kw.update(max_tokens=1500)
    return kw


_HEADING_LINE = re.compile(r"^\s*(#+\s.*|\*\*[^*]{1,80}\*\*:?|[A-Z][\w ,:&()-]{0,60})\s*$")
_PREAMBLE = re.compile(r"^(here('| i)s|sure[,!]|certainly[,!]|below is|of course)", re.I)


def clean_output(text: str) -> str:
    lines = []
    for line in text.replace("\r", "").split("\n"):
        t = line.strip()
        if not t:
            lines.append("")
            continue
        if _PREAMBLE.match(t) and len(t.split()) < 25 and t.endswith(":"):
            continue
        if _HEADING_LINE.match(t) and not t.endswith((".", "?", "!")):
            continue
        lines.append(t.replace("**", "").lstrip("-• ").strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def load_sections(role_filter=None) -> list[dict]:
    rows = [json.loads(line) for line in open(SECTIONS)]
    return [r for r in rows if r["role"] != "audit" and (role_filter is None or r["role"] in role_filter)]


def _openai_client():
    from dotenv import load_dotenv
    import openai

    load_dotenv(ROOT.parent / ".env")
    return openai.OpenAI()


def _anthropic_client():
    from dotenv import load_dotenv
    import anthropic

    load_dotenv(ROOT.parent / ".env")
    return anthropic.Anthropic()


def pilot(per_model: int = 2) -> None:
    rows = load_sections()
    ant, oai = _anthropic_client(), _openai_client()
    for gen, prov, _, _ in PLAN:
        for s in [r for r in rows if r["generator"] == gen][:per_model]:
            t0 = time.time()
            if prov == "anthropic":
                m = ant.messages.create(**claude_params(s))
                text = next((b.text for b in m.content if b.type == "text"), "")
                usage = f"in={m.usage.input_tokens} out={m.usage.output_tokens} stop={m.stop_reason}"
            else:
                r = oai.chat.completions.create(**openai_kwargs(s))
                text = r.choices[0].message.content or ""
                usage = f"in={r.usage.prompt_tokens} out={r.usage.completion_tokens} stop={r.choices[0].finish_reason}"
            out = clean_output(text)
            print(f"\n=== {gen} [{s['task']}] {usage} {time.time() - t0:.1f}s words={len(out.split())} (human {len(s['human'].split())})")
            print(out[:400].replace("\n", " ") + " ...")


def generate_openai(workers: int = 8) -> None:
    path = OUT / "ai_openai.jsonl"
    done = {json.loads(line)["idx"] for line in open(path)} if path.exists() else set()
    todo = [s for s in load_sections() if s["provider"] == "openai" and s["idx"] not in done]
    print(f"openai: {len(todo)} to generate ({len(done)} already done)", file=sys.stderr)
    client = _openai_client()

    def one(s):
        for attempt in range(4):
            try:
                r = client.chat.completions.create(**openai_kwargs(s))
                return {"idx": s["idx"], "generator": s["generator"], "text": r.choices[0].message.content or "",
                        "finish": r.choices[0].finish_reason, "in": r.usage.prompt_tokens, "out": r.usage.completion_tokens}
            except Exception as e:  # rate limits and transient errors
                print(f"  {s['generator']} #{s['idx']} attempt {attempt}: {e}", file=sys.stderr)
                time.sleep(5 * 2**attempt)
        return None

    with open(path, "a") as f, ThreadPoolExecutor(workers) as ex:
        for k, row in enumerate(ex.map(one, todo), 1):
            if row:
                f.write(json.dumps(row) + "\n")
                f.flush()
            if k % 100 == 0:
                print(f"  {k}/{len(todo)}", file=sys.stderr)


def submit_claude() -> None:
    from anthropic.types.messages.batch_create_params import Request

    marker = OUT / "claude_batch.json"
    if marker.exists():
        print(f"batch already submitted: {json.loads(marker.read_text())}", file=sys.stderr)
        return
    rows = [s for s in load_sections() if s["provider"] == "anthropic"]
    client = _anthropic_client()
    batch = client.messages.batches.create(
        requests=[Request(custom_id=f"s{s['idx']}", params=claude_params(s)) for s in rows]
    )
    marker.write_text(json.dumps({"id": batch.id, "requests": len(rows)}))
    print(f"submitted Claude batch {batch.id} with {len(rows)} requests", file=sys.stderr)


def collect_claude() -> None:
    client = _anthropic_client()
    batch_id = json.loads((OUT / "claude_batch.json").read_text())["id"]
    batch = client.messages.batches.retrieve(batch_id)
    print(f"batch {batch_id}: {batch.processing_status} {batch.request_counts}", file=sys.stderr)
    if batch.processing_status != "ended":
        return
    gen_of = {f"s{s['idx']}": s for s in load_sections()}
    n = 0
    with open(OUT / "ai_claude.jsonl", "w") as f:
        for res in client.messages.batches.results(batch_id):
            if res.result.type != "succeeded":
                continue
            m = res.result.message
            s = gen_of[res.custom_id]
            text = next((b.text for b in m.content if b.type == "text"), "")
            f.write(json.dumps({"idx": s["idx"], "generator": s["generator"], "text": text, "finish": m.stop_reason,
                                "in": m.usage.input_tokens, "out": m.usage.output_tokens}) + "\n")
            n += 1
    print(f"wrote {n} Claude outputs", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["select", "pilot", "generate", "collect"])
    args = ap.parse_args()
    if args.cmd == "select":
        select()
    elif args.cmd == "pilot":
        pilot()
    elif args.cmd == "generate":
        submit_claude()
        generate_openai()
    else:
        collect_claude()


if __name__ == "__main__":
    main()
