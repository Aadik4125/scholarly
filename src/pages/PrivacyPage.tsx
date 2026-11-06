import InfoPageLayout from '../components/InfoPageLayout'
import { CONTACT_EMAIL, LEGAL_UPDATED, OWNER_NAME, SITE_URL } from '../siteInfo'

export default function PrivacyPage() {
  return (
    <InfoPageLayout title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        Scholarly ({SITE_URL}) is run by {OWNER_NAME} ("we", "us"). This policy explains what happens to the papers you
        upload and the other information we handle when you use the site.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Your paper is read in your browser, then its text is sent to our server for analysis.</li>
        <li>To analyze it, the text is shared with Anthropic (Claude) and OpenAI, and short passages are searched against OpenAlex and CORE.</li>
        <li>Our server does not keep a copy of your paper or its results. They are saved only in your own browser, and you can delete them at any time.</li>
        <li>We use Google Analytics to understand how the site is used.</li>
      </ul>

      <h2>Papers you upload</h2>
      <p>
        When you upload a PDF or Word file, its text is extracted in your browser. The text is then sent to our server
        and processed as follows:
      </p>
      <ul>
        <li>
          <strong>Anthropic (Claude)</strong> receives the text (up to a length limit) to find internal inconsistencies,
          writing suggestions, citation gaps and novelty notes, and to answer your questions in Ask My Paper.
        </li>
        <li>
          <strong>OpenAI</strong> receives passages of the text to create embeddings (numerical summaries of meaning), used
          to find repeated passages and similarity to published work.
        </li>
        <li>
          <strong>OpenAlex and CORE</strong>, open scholarly databases, receive short phrases, keywords and a sample of
          short passages (about 60 words each) from the text to search for related published papers. They do not receive
          the whole paper.
        </li>
        <li>
          <strong>AI-content detection</strong> runs on our own model, on our server. Your text is not sent to a third party for this.
        </li>
      </ul>
      <p>
        Anthropic and OpenAI process this data under their API terms, which state that data sent through their APIs is not
        used to train their models by default. They may keep it for a limited time to monitor for abuse. See the{' '}
        <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">Anthropic privacy policy</a> and the{' '}
        <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">OpenAI privacy policy</a>.
      </p>
      <p>
        Our server processes your paper only to produce the analysis and does not store it. Our server logs record technical
        events (such as timings and errors) but not the text of your paper.
      </p>

      <h2>Storage in your browser</h2>
      <p>
        Your uploaded file and its analysis are saved in your browser's local storage (IndexedDB) so you can return to them.
        This data stays on your device. You can remove a paper from the "Your papers" list on the home page, or clear all of it
        by clearing your browser's site data for {SITE_URL}.
      </p>

      <h2>Analytics and cookies</h2>
      <p>
        We use Google Analytics to measure visits and how features are used (for example, how many uploads finish). Google
        Analytics sets cookies and collects information such as your approximate location, device, browser and the pages you
        visit. It does not receive the content of your papers. You can learn more in{' '}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses data from sites that use its services</a>, and opt out with the{' '}
        <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics opt-out browser add-on</a>.
      </p>
      <p>
        We may use advertising services such as Google Ads to promote Scholarly. These may use cookies to measure whether an ad
        led to a visit or an analysis.
      </p>

      <h2>Other information we process</h2>
      <ul>
        <li>
          <strong>IP address:</strong> used briefly, in memory, to apply fair-use limits (for example, a number of analyses per
          hour). It is not stored in a database.
        </li>
        <li>
          <strong>Account:</strong> if you sign in with Google, we store your name, email address, profile picture and sign-up
          date. Accounts are managed by our authentication provider, Supabase. To enforce free-use and daily limits we also
          keep a random identifier in your browser and temporarily process your IP address.
        </li>
        <li>
          <strong>Feedback:</strong> if you use the feedback form, it is handled by Google Forms, and we see what you choose to submit.
        </li>
        <li>
          <strong>Email:</strong> if you contact us, we use your email address only to reply.
        </li>
      </ul>

      <h2>Service providers</h2>
      <p>
        The site is hosted on Render and delivered through Cloudflare, which process network traffic (such as IP addresses) to
        serve the site and protect it from abuse. The AI-detection model files are hosted on Hugging Face.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can try Scholarly once without an account; after that, a Google sign-in is required. You can delete your saved papers at any time as described above. Depending on
        where you live, you may have rights to access, correct or delete personal data we hold about you. Because we don't keep
        your papers on our server, most of that data is already under your control. For any request, contact us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Children</h2>
      <p>Scholarly is intended for students and researchers aged 16 and over. It is not directed at children under 13.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        {OWNER_NAME}, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </InfoPageLayout>
  )
}
