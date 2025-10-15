'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import LiveDraft from '@/app/components/LiveDraft'
import AddPickForm from '@/app/components/AddPickForm'
import AvailablePlayersTable from '@/app/components/AvailablePlayersTable'
import MyTeam from '@/app/components/MyTeam'
import Recommendations from '@/app/components/Recommendations'
import TeamSetup from '@/app/components/TeamSetup'
import TeamBudgets from '@/app/components/TeamBudgets'

interface Player {
  name: string
  team: string
  position: string
  avgAuctionValue: number
  yahooAuctionValue: number | null
  headshotUrl: string
}

interface DraftPick {
  playerId: number
  playerName: string
  teamId: number
  pickNumber: number
  round: number
  bidAmount?: number
  isMyPick?: boolean
  draftedByTeam?: string
}

interface Team {
  name: string
  budget: number
  isMyTeam: boolean
}

interface DraftData {
  picks: DraftPick[]
  currentPick: number
  totalPicks: number
  isComplete: boolean
  teams: Team[]
  myTeamBudget?: number
  teamsConfigured?: boolean
}

interface Recommendation {
  name: string
  reasoning: string
  suggestedPrice?: number
}

export default function DraftTracker() {
  const params = useParams()
  const router = useRouter()
  const leagueId = params.leagueId as string

  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [draftData, setDraftData] = useState<DraftData | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'draft' | 'available' | 'myteam' | 'teams'>('draft')
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isLoadingRecs, setIsLoadingRecs] = useState(false)

  // Load player data
  useEffect(() => {
    fetch('/merged-draft-data.json')
      .then(res => res.json())
      .then(data => setAllPlayers(data))
      .catch(err => console.error('Failed to load player data:', err))
  }, [])

  // Fetch draft data from sync endpoint
  const fetchDraftData = useCallback(async () => {
    try {
      const response = await fetch(`/api/draft-sync/${leagueId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch draft data')
      }

      const data: DraftData = await response.json()
      setDraftData(data)
      setError(null)
      setIsLoadingDraft(false)
    } catch (err: any) {
      setError(err.message)
      setIsLoadingDraft(false)
    }
  }, [leagueId])

  // Fetch AI recommendations with roster-based context
  const fetchRecommendations = useCallback(async (picks: DraftPick[], remainingBudget: number) => {
    if (allPlayers.length === 0) return

    setIsLoadingRecs(true)

    try {
      const draftedPlayerNames = picks.map(p => p.playerName)
      const availablePlayers = allPlayers.filter(
        p => !draftedPlayerNames.some(name =>
          name.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(name.toLowerCase())
        )
      )

      // Prepare my team roster data
      const myTeamPicks = picks.filter(p => p.isMyPick)
      const myTeam = myTeamPicks.map(pick => {
        const playerData = allPlayers.find(p =>
          p.name.toLowerCase() === pick.playerName.toLowerCase() ||
          p.name.toLowerCase().includes(pick.playerName.toLowerCase()) ||
          pick.playerName.toLowerCase().includes(p.name.toLowerCase())
        )
        return {
          playerName: pick.playerName,
          position: playerData?.position || 'Unknown',
          bidAmount: pick.bidAmount || 0,
          avgValue: playerData?.avgAuctionValue || 0
        }
      })

      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftedPlayers: draftedPlayerNames,
          availablePlayers,
          myTeam,
          remainingBudget,
          totalBudget: 200
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get recommendations')
      }

      const data = await response.json()
      setRecommendations(data.recommendations || [])
    } catch (err) {
      console.error('Error fetching recommendations:', err)
    } finally {
      setIsLoadingRecs(false)
    }
  }, [allPlayers])

  // Manual refresh recommendations
  const handleRefreshRecs = useCallback(async () => {
    if (draftData) {
      await fetchRecommendations(draftData.picks, draftData.myTeamBudget || 200)
    }
  }, [draftData, fetchRecommendations])

  // Add pick manually
  const handleAddPick = useCallback(async (playerName: string, salary: number, isMyPick: boolean, draftedByTeam: string) => {
    try {
      const response = await fetch(`/api/draft-sync/${leagueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, bidAmount: salary, isMyPick, draftedByTeam })
      })

      if (!response.ok) {
        throw new Error('Failed to add pick')
      }

      // Refresh draft data
      await fetchDraftData()

      // Fetch new recommendations in the background (don't await)
      if (allPlayers.length > 0) {
        fetch(`/api/draft-sync/${leagueId}`)
          .then(res => res.json())
          .then(updatedData => {
            fetchRecommendations(updatedData.picks, updatedData.myTeamBudget || 200)
          })
          .catch(err => console.error('Error fetching recommendations:', err))
      }
    } catch (error) {
      console.error('Error adding pick:', error)
      throw error
    }
  }, [leagueId, fetchDraftData, allPlayers, fetchRecommendations])

  // Reset draft
  const handleResetDraft = useCallback(async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset the draft? This will delete all picks and cannot be undone!'
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/draft-sync/${leagueId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to reset draft')
      }

      // Refresh draft data
      await fetchDraftData()
      setRecommendations([])
      alert('✅ Draft reset successfully!')
    } catch (error) {
      console.error('Error resetting draft:', error)
      alert('❌ Failed to reset draft. Please try again.')
    }
  }, [leagueId, fetchDraftData])

  // Handle team setup completion
  const handleTeamSetup = useCallback(async (teams: Team[]) => {
    try {
      const response = await fetch(`/api/draft-sync/${leagueId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams })
      })

      if (!response.ok) {
        throw new Error('Failed to initialize draft')
      }

      // Refresh draft data to load initialized state
      await fetchDraftData()
    } catch (error) {
      console.error('Error initializing draft:', error)
      alert('❌ Failed to initialize draft. Please try again.')
    }
  }, [leagueId, fetchDraftData])

  // Initial fetch
  useEffect(() => {
    fetchDraftData()
  }, [fetchDraftData])

  // No auto-polling for manual draft tracking

  // Check authentication
  useEffect(() => {
    const auth = localStorage.getItem('draft_tracker_auth')
    if (!auth) {
      router.push('/')
    }
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">Error Loading Draft</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (isLoadingDraft) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading draft data...</p>
        </div>
      </div>
    )
  }

  if (!draftData) {
    return null
  }

  // Show team setup if teams not configured
  if (!draftData.teamsConfigured) {
    return <TeamSetup onComplete={handleTeamSetup} />
  }

  const availablePlayers = allPlayers.filter(
    p => !draftData.picks.some(pick =>
      pick.playerName.toLowerCase().includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(pick.playerName.toLowerCase())
    )
  )

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-orange-400 bg-clip-text text-transparent">
                Draft Tracker
              </h1>
              <p className="text-gray-400 text-sm">Live Draft Tracking</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleResetDraft}
                className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Reset Draft
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('draft_tracker_auth')
                  router.push('/')
                }}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-dark-border">
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === 'draft'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Draft Board
              {activeTab === 'draft' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('myteam')}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === 'myteam'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              My Team
              {activeTab === 'myteam' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === 'teams'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              All Teams
              {activeTab === 'teams' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('available')}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === 'available'
                  ? 'text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Available Players
              {activeTab === 'available' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Main Content */}
        {activeTab === 'teams' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Center: Team Budgets */}
            <div className="lg:col-span-2">
              <TeamBudgets teams={draftData.teams} picks={draftData.picks} />
            </div>

            {/* Right: Add Pick & Stats */}
            <div>
              <div className="sticky top-4 space-y-4">
                {/* Add Pick Form */}
                <AddPickForm
                  availablePlayers={availablePlayers}
                  onPickAdded={handleAddPick}
                  currentPickNumber={draftData.currentPick}
                  remainingBudget={draftData.myTeamBudget || 200}
                  teams={draftData.teams}
                />

                {/* Stats Card */}
                <div className="card">
                  <h3 className="font-bold mb-3">Draft Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Picks:</span>
                      <span className="font-semibold">{draftData.picks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Available:</span>
                      <span className="font-semibold text-green-400">{availablePlayers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Teams:</span>
                      <span className="font-semibold text-primary">{draftData.teams.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'myteam' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Center: AI Recommendations (Main Focus) */}
            <div className="lg:col-span-2 space-y-6">
              {/* AI Recommendations - Large */}
              <Recommendations
                recommendations={recommendations}
                allPlayers={allPlayers}
                isLoading={isLoadingRecs}
                onRefresh={handleRefreshRecs}
              />

              {/* My Team - Below Recommendations */}
              <MyTeam
                picks={draftData.picks}
                allPlayers={allPlayers}
                remainingBudget={draftData.myTeamBudget || 200}
                totalBudget={200}
              />
            </div>

            {/* Right: Add Pick & Stats */}
            <div>
              <div className="sticky top-4 space-y-4">
                {/* Add Pick Form */}
                <AddPickForm
                  availablePlayers={availablePlayers}
                  onPickAdded={handleAddPick}
                  currentPickNumber={draftData.currentPick}
                  remainingBudget={draftData.myTeamBudget || 200}
                  teams={draftData.teams}
                />

                {/* Stats Card */}
                <div className="card">
                  <h3 className="font-bold mb-3">Draft Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Budget Remaining:</span>
                      <span className={`font-bold text-lg ${(draftData.myTeamBudget || 200) < 20 ? 'text-red-400' : 'text-green-400'}`}>
                        ${draftData.myTeamBudget || 200}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">My Team:</span>
                      <span className="font-semibold text-primary">
                        {draftData.picks.filter(p => p.isMyPick).length} players
                      </span>
                    </div>
                    <div className="border-t border-dark-border my-2"></div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Drafted:</span>
                      <span className="font-semibold">{draftData.picks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Available:</span>
                      <span className="font-semibold text-green-400">{availablePlayers.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'draft' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Center: Draft Info */}
            <div className="lg:col-span-2">
              <LiveDraft
                picks={draftData.picks}
                allPlayers={allPlayers}
                currentPick={draftData.currentPick}
                totalPicks={draftData.totalPicks}
                isComplete={draftData.isComplete}
                teams={draftData.teams}
              />
            </div>

            {/* Right: Add Pick & Stats */}
            <div>
              <div className="sticky top-4 space-y-4">
                {/* Add Pick Form */}
                <AddPickForm
                  availablePlayers={availablePlayers}
                  onPickAdded={handleAddPick}
                  currentPickNumber={draftData.currentPick}
                  remainingBudget={draftData.myTeamBudget || 200}
                  teams={draftData.teams}
                />

                {/* Stats Card */}
                <div className="card">
                  <h3 className="font-bold mb-3">Draft Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Players:</span>
                      <span className="font-semibold">{allPlayers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Drafted:</span>
                      <span className="font-semibold text-primary">{draftData.picks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Available:</span>
                      <span className="font-semibold text-green-400">{availablePlayers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Teams:</span>
                      <span className="font-semibold">{draftData.teams.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Center: Available Players Table */}
            <div className="lg:col-span-2">
              <AvailablePlayersTable availablePlayers={availablePlayers} />
            </div>

            {/* Right: Add Pick & Stats */}
            <div>
              <div className="sticky top-4 space-y-4">
                {/* Add Pick Form */}
                <AddPickForm
                  availablePlayers={availablePlayers}
                  onPickAdded={handleAddPick}
                  currentPickNumber={draftData.currentPick}
                  remainingBudget={draftData.myTeamBudget || 200}
                  teams={draftData.teams}
                />

                {/* Stats Card */}
                <div className="card">
                  <h3 className="font-bold mb-3">Draft Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Players:</span>
                      <span className="font-semibold">{allPlayers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Drafted:</span>
                      <span className="font-semibold text-primary">{draftData.picks.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Available:</span>
                      <span className="font-semibold text-green-400">{availablePlayers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Teams:</span>
                      <span className="font-semibold">{draftData.teams.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
