import type { Paper } from '../types'

export function getRealAnswer(paper: Paper, question: string): { content: string; groundedIn: string[] } {
  const q = question.toLowerCase()
  const openIssues = paper.consistencyIssues.filter((i) => i.status === 'open')

  if (q.includes('viva') || q.includes('challenge')) {
    if (openIssues.length === 0) {
      return {
        content:
          "The pattern-based checks didn't flag any contradictions to point to here. That's not a clean bill of health, though — this is a narrow heuristic scan (numeric mismatches, model-name conflicts, dataset-size conflicts), not a full review.",
        groundedIn: [],
      }
    }
    const top = openIssues[0]
    return {
      content: `Based on the pattern checks, a viva panel would likely press on: "${top.title}". ${top.explanation}`,
      groundedIn: top.locations.map((l) => l.section),
    }
  }

  if (q.includes('citation') || q.includes('unsupported') || q.includes('not backed') || q.includes('claim')) {
    if (paper.citationGaps.length === 0) {
      return { content: 'No unsupported strong-claim sentences were matched by the citation-gap checks.', groundedIn: [] }
    }
    const gaps = paper.citationGaps.map((g) => `"${g.claim}" (${g.section})`).join('; ')
    return {
      content: `The pattern checks flagged ${paper.citationGaps.length} claim(s) that read as strong assertions without a nearby citation marker: ${gaps}.`,
      groundedIn: paper.citationGaps.map((g) => g.section),
    }
  }

  if (q.includes('summar') || q.includes('structure') || q.includes('about')) {
    const headings = paper.sections.map((s) => s.heading).join(', ')
    return {
      content: `I can't generate a real semantic summary without an LLM backend — but the structure extraction found these sections: ${headings || 'none clearly detected'}. Across them, the pattern checks found ${openIssues.length} potential contradiction(s), ${paper.writingSuggestions.length} mechanical writing fix(es), and ${paper.citationGaps.length} possible citation gap(s).`,
      groundedIn: paper.sections.slice(0, 4).map((s) => s.heading),
    }
  }

  if (q.includes('accuracy') || q.includes('number') || q.includes('%')) {
    const numberIssue = openIssues.find((i) => i.category === 'numbers')
    if (numberIssue) {
      return {
        content: `${numberIssue.title}. ${numberIssue.explanation}`,
        groundedIn: numberIssue.locations.map((l) => l.section),
      }
    }
    return { content: 'No conflicting numeric metrics were matched across your sections by the pattern checks.', groundedIn: [] }
  }

  return {
    content: `I don't have real semantic understanding of your document in this client-side demo — I can only surface what the pattern-based engines found: ${openIssues.length} open consistency issue(s), ${paper.writingSuggestions.length} writing suggestion(s), ${paper.citationGaps.length} citation gap(s). Try asking what a viva panel might challenge, or which claims aren't backed by a citation.`,
    groundedIn: [],
  }
}
