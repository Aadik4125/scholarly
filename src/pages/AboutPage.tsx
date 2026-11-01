import { Link } from 'react-router-dom'
import InfoPageLayout from '../components/InfoPageLayout'
import { FEEDBACK_URL } from '../components/FeedbackButton'
import { CONTACT_EMAIL, OWNER_NAME } from '../siteInfo'

export default function AboutPage() {
  return (
    <InfoPageLayout title="About & Contact">
      <p>
        Scholarly is an AI copilot for academic research and integrity. Students and researchers upload a draft paper (PDF or
        Word) and get a full review in a couple of minutes, before they submit.
      </p>

      <h2>What it checks</h2>
      <ul>
        <li><strong>Consistency:</strong> contradictions inside the paper, such as numbers, dataset sizes or methods that don't match between sections.</li>
        <li><strong>Writing:</strong> clearer, more academic wording that keeps your meaning.</li>
        <li><strong>Citations:</strong> strong claims that may need a source.</li>
        <li><strong>Similarity:</strong> passages that closely match published research, found through the OpenAlex and CORE open-access databases.</li>
        <li><strong>AI content:</strong> an estimate of how much of the text reads as AI-generated, from our own detection model.</li>
        <li><strong>Ask My Paper:</strong> answers to your questions about your own paper, like a practice viva.</li>
      </ul>
      <p>
        Your paper stays in your browser. Our server analyzes it and keeps no copy. See the <Link to="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>Who runs Scholarly</h2>
      <p>Scholarly is built and run by {OWNER_NAME}.</p>

      <h2>Contact</h2>
      <p>
        For questions, partnerships or privacy requests, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      {FEEDBACK_URL && (
        <p>
          Using Scholarly? We'd love your feedback:{' '}
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">share it in our short form</a>.
        </p>
      )}
    </InfoPageLayout>
  )
}
