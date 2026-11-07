// Run: npm run test:xref
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCrossReferences } from './crossReferences.ts'

const titles = (text: string) => checkCrossReferences(text).issues.map((i) => i.title)

test('flags missing figures/tables, out-of-range and unused numbered references', () => {
  const text = `Introduction
Figure 1 shows the pipeline and Figure 3 shows the interface. See Table 1 and Table 2 [1].
Figure 1: System pipeline.
Figure 2: Detection examples.
Table 1: Accuracy.
We use a CNN [2, 3] trained on 5,000 images [6].
References
[1] A. Kumar, Face recognition survey, 2020.
[2] B. Rao, Attendance systems, 2019.
[3] C. Lee, Deep CNNs, 2018.
[4] D. Singh, Face embeddings, 2021.`
  assert.deepEqual(titles(text), [
    "Figure 3 is mentioned but doesn't exist",
    "Table 2 is mentioned but doesn't exist",
    '[6] is cited, but the reference list ends at [4]',
    'Figure 2 is never referred to in the text',
    '1 reference is never cited',
  ])
})

test('a consistent paper is clean, and value ranges are not citations', () => {
  const text = `Introduction
As shown in Figure 1 and Table I, accuracy improves [1]-[3]. Images are resized to [256, 480] [2].
Figure 1: Overview.
TABLE I
Results on the test set.
R EFERENCES
[1] A. One, Paper one, 2020.
[2] B. Two, Paper two, 2021.
[3] C. Three, Paper three, 2022.`
  assert.deepEqual(titles(text), [])
})

test('author-year citations are checked against the reference list', () => {
  const text = `Introduction
Prior work (Smith et al., 2020; Lee & Kim, 2019) and Okafor (2022) studied this.
References
Lee, J., & Kim, S. (2019). A study. Journal.
Okafor, B. (2022). Ensemble methods. Journal.
Patel, R. (2018). Another study. Journal.`
  assert.deepEqual(titles(text), ['1 citation not found in your reference list'])
})
