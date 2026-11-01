import { Link } from 'react-router-dom'
import InfoPageLayout from '../components/InfoPageLayout'
import { CONTACT_EMAIL, LEGAL_UPDATED, OWNER_NAME, SITE_URL } from '../siteInfo'

export default function TermsPage() {
  return (
    <InfoPageLayout title="Terms of Use" updated={LEGAL_UPDATED}>
      <p>
        These terms apply to your use of Scholarly ({SITE_URL}), run by {OWNER_NAME}. By using the site, you agree to them.
      </p>

      <h2>What Scholarly does</h2>
      <p>
        Scholarly analyzes academic papers you upload. It checks for internal inconsistencies, suggests writing improvements,
        points out claims that may need citations, estimates similarity to published work, estimates how much of the text may
        be AI-generated, and answers questions about your paper. The service is free and provided as it is. We may change,
        limit or stop features at any time.
      </p>

      <h2>Results are guidance, not verdicts</h2>
      <p>
        Scholarly's results are produced automatically and can be wrong. In particular, the similarity score and the
        AI-content estimate are statistical indicators, not proof of plagiarism or of how a paper was written. They should not
        be the only basis for any academic, disciplinary or employment decision about a person. Always review results yourself
        and use your own judgment.
      </p>

      <h2>Your content</h2>
      <ul>
        <li>You keep all rights to the papers you upload.</li>
        <li>
          Only upload documents you have the right to use. You give us permission to process them as described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>, only to provide the analysis.
        </li>
        <li>Don't upload documents containing sensitive personal data about other people.</li>
      </ul>

      <h2>Fair use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the site for anything unlawful, or to help anyone cheat or breach academic integrity rules;</li>
        <li>try to get around usage limits, or use bots or scripts to send large numbers of requests;</li>
        <li>use Ask My Paper or other features for purposes unrelated to analyzing your paper;</li>
        <li>attempt to break, overload, probe or reverse-engineer the service or its security;</li>
        <li>copy or resell the service.</li>
      </ul>
      <p>We may limit or block access if these terms are broken.</p>

      <h2>Third-party services</h2>
      <p>
        Scholarly relies on third-party services, including Anthropic, OpenAI, OpenAlex and CORE. Their availability and
        results are outside our control.
      </p>

      <h2>No warranty and limitation of liability</h2>
      <p>
        Scholarly is provided "as is", without warranties of any kind. To the extent allowed by law, {OWNER_NAME} is not liable
        for any loss or damage arising from your use of the site or reliance on its results, including academic outcomes, lost
        data or lost work. Keep your own copies of your papers.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows when they last changed. Continuing to use the site means you accept the updated terms.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </InfoPageLayout>
  )
}
