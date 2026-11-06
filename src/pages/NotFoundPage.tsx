import { Link } from 'react-router-dom'
import InfoPageLayout from '../components/InfoPageLayout'

export default function NotFoundPage() {
  return (
    <InfoPageLayout title="Page not found">
      <p>Sorry, there's no page at this address.</p>
      <p>
        <Link to="/">Go to the Scholarly home page</Link> to upload a paper.
      </p>
    </InfoPageLayout>
  )
}
