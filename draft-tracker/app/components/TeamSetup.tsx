'use client'

import { useState } from 'react'

interface Team {
  name: string
  budget: number
  isMyTeam: boolean
}

interface TeamSetupProps {
  onComplete: (teams: Team[], myTeamIndex: number) => void
}

export default function TeamSetup({ onComplete }: TeamSetupProps) {
  const [numTeams, setNumTeams] = useState(10)
  const [teamNames, setTeamNames] = useState<string[]>(
    Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`)
  )
  const [myTeamIndex, setMyTeamIndex] = useState(0)
  const [step, setStep] = useState<'count' | 'names' | 'select'>('count')

  const handleNumTeamsChange = (num: number) => {
    setNumTeams(num)
    setTeamNames(Array.from({ length: num }, (_, i) =>
      i < teamNames.length ? teamNames[i] : `Team ${i + 1}`
    ))
  }

  const handleTeamNameChange = (index: number, name: string) => {
    const newNames = [...teamNames]
    newNames[index] = name
    setTeamNames(newNames)
  }

  const handleComplete = () => {
    const teams: Team[] = teamNames.map((name, index) => ({
      name: name.trim() || `Team ${index + 1}`,
      budget: 200,
      isMyTeam: index === myTeamIndex
    }))
    onComplete(teams, myTeamIndex)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="card">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
            Draft Setup
          </h1>
          <p className="text-gray-400 mb-6">Configure your draft before starting</p>

          {step === 'count' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  How many teams are in this draft?
                </label>
                <div className="grid grid-cols-5 gap-3">
                  {[8, 10, 12, 14, 16].map(num => (
                    <button
                      key={num}
                      onClick={() => handleNumTeamsChange(num)}
                      className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                        numTeams === num
                          ? 'bg-primary text-white ring-2 ring-white ring-offset-2 ring-offset-dark-card'
                          : 'bg-dark-bg text-gray-300 hover:bg-dark-border'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep('names')}
                className="btn-primary w-full"
              >
                Next: Enter Team Names
              </button>
            </div>
          )}

          {step === 'names' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Enter team names ({numTeams} teams)
                </label>
                <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {teamNames.map((name, index) => (
                    <div key={index}>
                      <label className="text-xs text-gray-500 mb-1 block">
                        Team {index + 1}
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleTeamNameChange(index, e.target.value)}
                        className="input-field"
                        placeholder={`Team ${index + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('count')}
                  className="flex-1 px-4 py-2 bg-dark-bg hover:bg-dark-border text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 btn-primary"
                >
                  Next: Select Your Team
                </button>
              </div>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Which team is yours?
                </label>
                <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                  {teamNames.map((name, index) => (
                    <button
                      key={index}
                      onClick={() => setMyTeamIndex(index)}
                      className={`px-4 py-3 rounded-lg font-semibold text-left transition-all ${
                        myTeamIndex === index
                          ? 'bg-primary text-white ring-2 ring-white ring-offset-2 ring-offset-dark-card'
                          : 'bg-dark-bg text-gray-300 hover:bg-dark-border'
                      }`}
                    >
                      {name || `Team ${index + 1}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg border border-primary/30">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-primary">Your Team:</span>{' '}
                  {teamNames[myTeamIndex] || `Team ${myTeamIndex + 1}`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Each team starts with $200 budget. We'll track spending for all teams.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('names')}
                  className="flex-1 px-4 py-2 bg-dark-bg hover:bg-dark-border text-white rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  className="flex-1 btn-primary"
                >
                  Start Draft
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
