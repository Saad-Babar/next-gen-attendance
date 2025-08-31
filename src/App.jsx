import { useState } from 'react'
import './App.css'

function App() {
  return (
    <div className="landing-container">
      <div className="landing-hero">
        <div className="face-icon">
          {/* Futuristic face recognition SVG icon */}
          <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="24" stroke="#61dafb" strokeWidth="3" fill="none" />
            <ellipse cx="32" cy="36" rx="12" ry="8" fill="#61dafb22" />
            <circle cx="24" cy="30" r="3" fill="#61dafb" />
            <circle cx="40" cy="30" r="3" fill="#61dafb" />
            <path d="M26 42 Q32 48 38 42" stroke="#61dafb" strokeWidth="2" fill="none" />
            <rect x="6" y="6" width="10" height="10" rx="3" stroke="#646cff" strokeWidth="2" fill="none" />
            <rect x="48" y="6" width="10" height="10" rx="3" stroke="#646cff" strokeWidth="2" fill="none" />
            <rect x="6" y="48" width="10" height="10" rx="3" stroke="#646cff" strokeWidth="2" fill="none" />
            <rect x="48" y="48" width="10" height="10" rx="3" stroke="#646cff" strokeWidth="2" fill="none" />
          </svg>
        </div>
      </div>
      <header className="landing-header">
        <h1>Futuristic Face Recognition Attendance</h1>
        <p className="landing-description">
          Step into the future of attendance management.<br />
          <b>AI-powered face recognition</b> ensures secure, contactless, and lightning-fast check-ins.<br />
          Eliminate proxies, boost efficiency, and experience seamless automation for your organization or institution.<br /><br />
          <span style={{color:'#61dafb', fontWeight:600}}>Your face is your identity. Attendance, reimagined.</span>
        </p>
      </header>
      <div className="landing-actions">
        <button className="landing-btn" onClick={() => window.location.href = '/register'}>Register</button>
        <button className="landing-btn" onClick={() => window.location.href = '/login'}>Login</button>
      </div>
    </div>
  )
}

export default App
