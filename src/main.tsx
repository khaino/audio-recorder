import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Handle browser extension errors gracefully
window.addEventListener('unhandledrejection', (event) => {
  // Suppress common browser extension errors
  if (event.reason?.message?.includes('message channel closed') ||
      event.reason?.message?.includes('Extension context invalidated') ||
      event.reason?.message?.includes('listener indicated an asynchronous response') ||
      event.reason?.message?.includes('but the message channel closed before a response was received')) {
    event.preventDefault();
    return;
  }
});

// Handle synchronous errors from extensions
window.addEventListener('error', (event) => {
  // Suppress common browser extension errors
  if (event.message?.includes('message channel closed') ||
      event.message?.includes('Extension context invalidated') ||
      event.message?.includes('listener indicated an asynchronous response') ||
      event.message?.includes('but the message channel closed before a response was received')) {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
