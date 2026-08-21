/*
 * Boots the Event Check-In System React application in the browser.
 * This file connects the global retro styling and the App that contains organizer and attendee flows.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
