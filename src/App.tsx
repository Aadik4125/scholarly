import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import AppLayout from './components/AppLayout'
import OverviewPage from './pages/OverviewPage'
import ConsistencyPage from './pages/ConsistencyPage'
import AskPaperPage from './pages/AskPaperPage'
import WritingPage from './pages/WritingPage'
import SimilarityPage from './pages/SimilarityPage'
import NoveltyPage from './pages/NoveltyPage'
import VersionsPage from './pages/VersionsPage'
import AiContentPage from './pages/AiContentPage'
import { ThemeProvider } from './hooks/useTheme'
import { ToastProvider } from './hooks/useToast'
import { SessionFileProvider } from './hooks/useSessionFile'
import BackgroundDoodles from './components/doodles/BackgroundDoodles'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SessionFileProvider>
          <BackgroundDoodles />
          <div className="relative z-10">
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<UploadPage />} />
                <Route path="/paper/:paperId" element={<AppLayout />}>
                  <Route index element={<OverviewPage />} />
                  <Route path="consistency" element={<ConsistencyPage />} />
                  <Route path="ask" element={<AskPaperPage />} />
                  <Route path="writing" element={<WritingPage />} />
                  <Route path="similarity" element={<SimilarityPage />} />
                  <Route path="ai-content" element={<AiContentPage />} />
                  <Route path="novelty" element={<NoveltyPage />} />
                  <Route path="versions" element={<VersionsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </div>
        </SessionFileProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
