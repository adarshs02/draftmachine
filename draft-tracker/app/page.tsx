'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ACCESS_CODE = 'DRAFT2026' // Change this to your secret code
const DEFAULT_LEAGUE_ID = 'main' // Default league ID for manual tracking

export default function Home() {
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if already authenticated
    const auth = localStorage.getItem('draft_tracker_auth')
    if (auth === 'true') {
      // Redirect directly to draft tracker
      router.push(`/draft/${DEFAULT_LEAGUE_ID}`)
    }
    setIsLoading(false)
  }, [router])

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (code === ACCESS_CODE) {
      localStorage.setItem('draft_tracker_auth', 'true')
      router.push(`/draft/${DEFAULT_LEAGUE_ID}`)
    } else {
      setCodeError('Invalid access code')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card text-center">
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
              Basketball Draft Tracker
            </h1>
            <p className="text-gray-400">Enter access code to continue</p>
          </div>

          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Access Code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setCodeError('')
                }}
                className="input-field text-center text-lg tracking-wider"
                autoFocus
              />
              {codeError && (
                <p className="text-red-500 text-sm mt-2">{codeError}</p>
              )}
            </div>

            <button type="submit" className="btn-primary w-full">
              Access Tracker
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-dark-border">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Features:</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Manual pick recording with autocomplete</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>AI-powered recommendations using Claude</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Player auction values from ESPN & Yahoo</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Salary tracking with value analysis</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
