'use client'

import { useState, useEffect, useRef } from 'react'

interface Player {
  name: string
  team: string
  position: string
  avgAuctionValue: number
  yahooAuctionValue: number | null
  headshotUrl: string
}

interface Team {
  name: string
  budget: number
  isMyTeam: boolean
}

interface AddPickFormProps {
  availablePlayers: Player[]
  onPickAdded: (playerName: string, salary: number, isMyPick: boolean, draftedByTeam: string) => void
  currentPickNumber: number
  remainingBudget: number
  teams?: Team[]
}

export default function AddPickForm({ availablePlayers, onPickAdded, currentPickNumber, remainingBudget, teams = [] }: AddPickFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [salary, setSalary] = useState('')
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [draftedByTeam, setDraftedByTeam] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find user's team
  const myTeam = teams.find(t => t.isMyTeam)
  const myTeamName = myTeam?.name || 'My Team'

  // Filter players based on search term
  useEffect(() => {
    if (searchTerm.length < 2) {
      setFilteredPlayers([])
      setShowDropdown(false)
      return
    }

    const filtered = availablePlayers
      .filter(player =>
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.position.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .slice(0, 10) // Limit to 10 results

    setFilteredPlayers(filtered)
    setShowDropdown(filtered.length > 0)
  }, [searchTerm, availablePlayers])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handlePlayerSelect = (player: Player) => {
    setSelectedPlayer(player)
    setSearchTerm(player.name)
    setShowDropdown(false)
    setFilteredPlayers([])

    // Auto-fill salary with average auction value
    if (player.avgAuctionValue > 0) {
      setSalary(Math.round(player.avgAuctionValue).toString())
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedPlayer) {
      alert('Please select a player from the dropdown')
      return
    }

    if (!draftedByTeam.trim()) {
      alert('Please select a team')
      return
    }

    const salaryValue = parseInt(salary)
    if (isNaN(salaryValue) || salaryValue < 0) {
      alert('Please enter a valid salary amount')
      return
    }

    // Determine if this is my pick based on team selection
    const isMyPick = draftedByTeam === myTeamName

    // Check if budget allows this pick
    if (isMyPick && salaryValue > remainingBudget) {
      alert(`Not enough budget! Remaining: $${remainingBudget}`)
      return
    }

    setIsSubmitting(true)

    try {
      await onPickAdded(selectedPlayer.name, salaryValue, isMyPick, draftedByTeam.trim())

      // Reset form
      setSearchTerm('')
      setSalary('')
      setSelectedPlayer(null)
      setDraftedByTeam('')
      setFilteredPlayers([])
      inputRef.current?.focus()
    } catch (error) {
      console.error('Error adding pick:', error)
      alert('Failed to add pick. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-4">Add Pick #{currentPickNumber}</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Player Search with Autocomplete */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Player Name
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setSelectedPlayer(null)
              }}
              onFocus={() => {
                if (filteredPlayers.length > 0 && !selectedPlayer) {
                  setShowDropdown(true)
                }
              }}
              placeholder="Search player by name, team, or position..."
              className={`input-field ${selectedPlayer ? 'bg-dark-bg border-green-500/30' : ''}`}
              disabled={isSubmitting || selectedPlayer !== null}
              readOnly={selectedPlayer !== null}
            />
            {selectedPlayer && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlayer(null)
                    setSearchTerm('')
                    setSalary('')
                    inputRef.current?.focus()
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && filteredPlayers.length > 0 && !selectedPlayer && (
            <div
              ref={dropdownRef}
              className="absolute z-10 w-full mt-1 bg-dark-card border border-dark-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
            >
              {filteredPlayers.map((player, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handlePlayerSelect(player)}
                  className="w-full px-4 py-3 text-left hover:bg-dark-bg transition-colors flex items-center gap-3 border-b border-dark-border last:border-b-0"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-white">{player.name}</div>
                    <div className="text-xs text-gray-400">
                      {player.team} • {player.position} • Avg: ${Math.round(player.avgAuctionValue)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Salary Input */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Salary / Bid Amount ($)
          </label>
          <input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="Enter bid amount..."
            className="input-field"
            min="0"
            disabled={isSubmitting}
          />
          {selectedPlayer && selectedPlayer.avgAuctionValue > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Suggested: ${Math.round(selectedPlayer.avgAuctionValue)} (ESPN avg)
            </p>
          )}
        </div>

        {/* Team Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Team
          </label>
          {teams.length > 0 ? (
            <select
              value={draftedByTeam}
              onChange={(e) => setDraftedByTeam(e.target.value)}
              className="input-field"
              disabled={isSubmitting}
            >
              <option value="">Select team...</option>
              {teams.map((team) => (
                <option key={team.name} value={team.name}>
                  {team.name} {team.isMyTeam ? '(You)' : ''} - ${team.budget} remaining
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={draftedByTeam}
              onChange={(e) => setDraftedByTeam(e.target.value)}
              placeholder="Enter team name..."
              className="input-field"
              disabled={isSubmitting}
            />
          )}
          <p className="text-xs text-gray-500 mt-1">
            {teams.length > 0
              ? 'Select which team is drafting this player'
              : 'Enter the team name manually'}
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!selectedPlayer || !salary || isSubmitting}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              <span>Adding Pick...</span>
            </div>
          ) : (
            'Add Pick'
          )}
        </button>
      </form>

      {/* Selected Player Preview */}
      {selectedPlayer && (
        <div className="mt-4 p-3 bg-dark-bg rounded-lg border border-primary/30">
          <div className="text-xs text-gray-400 mb-1">Selected:</div>
          <div className="font-semibold text-white">{selectedPlayer.name}</div>
          <div className="text-xs text-gray-400">
            {selectedPlayer.team} • {selectedPlayer.position}
          </div>
        </div>
      )}
    </div>
  )
}
