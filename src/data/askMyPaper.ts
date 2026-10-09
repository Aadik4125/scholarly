import { mockPaper } from './mockPaper'

export function getMockAnswer(question: string): { content: string; groundedIn: string[] } {
  const q = question.toLowerCase()

  if (q.includes('viva') || q.includes('challenge')) {
    return {
      content:
        'A viva panel would likely press on the mismatch between your Methodology and Results sections: you describe training an XGBoost classifier, but your Abstract and Conclusion report results for a Random Forest model. Be ready to explain which model actually produced your reported numbers, and why the accuracy figure differs between your Abstract (94.2%) and Results (91.7%).',
      groundedIn: ['3. Methodology', 'Abstract', '4. Results'],
    }
  }

  if (q.includes('conclusion') && (q.includes('follow') || q.includes('support'))) {
    return {
      content:
        'Partially. Your Conclusion claims the Random Forest model "demonstrates strong potential," which is consistent with your Discussion, but the Results section only reports metrics for the model you call XGBoost. Until the model identity is reconciled, the Conclusion\'s claim cannot be fully verified against the Results you present.',
      groundedIn: ['6. Conclusion', '4. Results'],
    }
  }

  if (q.includes('citation') || q.includes('unsupported') || q.includes('not backed')) {
    const gaps = mockPaper.citationGaps.map((g) => `"${g.claim}" (${g.section})`).join('; ')
    return {
      content: `I found ${mockPaper.citationGaps.length} claims that read as factual assertions without a supporting citation: ${gaps}. Consider adding a reference for each, or softening the claim to reflect it as your own interpretation.`,
      groundedIn: mockPaper.citationGaps.map((g) => g.section),
    }
  }

  if (q.includes('accuracy') || q.includes('94.2') || q.includes('91.7')) {
    return {
      content:
        'Your Abstract states 94.2% accuracy, while Section 4 (Results) reports 91.7% for what appears to be the same final model. This is flagged in the Consistency Engine as a high-severity issue. Common causes: the Abstract may not have been updated after a later re-run of the experiment, or the two figures come from different train/test splits or random seeds.',
      groundedIn: ['Abstract', '4. Results'],
    }
  }

  return {
    content:
      "I can answer that using your uploaded document, but I don't have a confident, evidence-backed answer for this specific question yet in this preview. Try asking about the model/accuracy mismatch, unsupported claims, or likely viva questions — those are grounded in flagged sections of your paper.",
    groundedIn: [],
  }
}
