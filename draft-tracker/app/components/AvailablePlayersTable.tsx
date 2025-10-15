'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'

interface Player {
  name: string
  team: string
  position: string
  avgAuctionValue: number
  yahooAuctionValue: number | null
  headshotUrl: string
}

interface AvailablePlayersTableProps {
  availablePlayers: Player[]
}

type SortDirection = 'asc' | 'desc'

export default function AvailablePlayersTable({ availablePlayers }: AvailablePlayersTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedPosition, setSelectedPosition] = useState<string>('All')

  // Get unique positions
  const positions = useMemo(() => {
    const uniquePositions = Array.from(new Set(availablePlayers.map(p => p.position)))
    return ['All', ...uniquePositions.sort()]
  }, [availablePlayers])

  // Filter and sort players
  const filteredAndSortedPlayers = useMemo(() => {
    // Filter by search term
    let filtered = availablePlayers.filter(player => {
      const search = searchTerm.toLowerCase()
      const matchesSearch = (
        player.name.toLowerCase().includes(search) ||
        player.team.toLowerCase().includes(search) ||
        player.position.toLowerCase().includes(search)
      )
      const matchesPosition = selectedPosition === 'All' || player.position === selectedPosition
      return matchesSearch && matchesPosition
    })

    // Sort by average auction value only
    filtered.sort((a, b) => {
      const comparison = a.avgAuctionValue - b.avgAuctionValue
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [availablePlayers, searchTerm, selectedPosition, sortDirection])

  const toggleSortDirection = () => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="card">
        <input
          type="text"
          placeholder="Search by name, team, or position..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field"
        />
      </div>

      {/* Filters */}
      <div className="card">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Available Players</h3>
              <p className="text-sm text-gray-400">
                Showing {filteredAndSortedPlayers.length} of {availablePlayers.length} players
              </p>
            </div>
            {/* Sort Direction */}
            <button
              onClick={toggleSortDirection}
              className="bg-dark-bg border border-dark-border rounded px-4 py-2 text-sm text-white hover:border-primary transition-colors"
            >
              {sortDirection === 'desc' ? '↓ High → Low' : '↑ Low → High'}
            </button>
          </div>

          {/* Position Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {positions.map(pos => {
              const isSelected = selectedPosition === pos
              const positionColors: Record<string, string> = {
                'All': 'bg-gray-600 hover:bg-gray-500',
                'PG': 'bg-blue-600 hover:bg-blue-500',
                'SG': 'bg-cyan-600 hover:bg-cyan-500',
                'SF': 'bg-green-600 hover:bg-green-500',
                'PF': 'bg-yellow-600 hover:bg-yellow-500',
                'C': 'bg-red-600 hover:bg-red-500',
                'G': 'bg-indigo-600 hover:bg-indigo-500',
                'F': 'bg-purple-600 hover:bg-purple-500',
                'UTIL': 'bg-pink-600 hover:bg-pink-500'
              }
              const colorClass = positionColors[pos] || 'bg-gray-600 hover:bg-gray-500'

              return (
                <button
                  key={pos}
                  onClick={() => setSelectedPosition(pos)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isSelected
                      ? `${colorClass} text-white ring-2 ring-white ring-offset-2 ring-offset-dark-card`
                      : `${colorClass} text-white opacity-60`
                  }`}
                >
                  {pos}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="text-left p-3 text-sm font-medium text-gray-400">
                  Player
                </th>
                <th className="text-left p-3 text-sm font-medium text-gray-400">
                  Position
                </th>
                <th className="text-left p-3 text-sm font-medium text-gray-400">Team</th>
                <th className="text-right p-3 text-sm font-medium text-gray-400">
                  Avg Value
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    No players found
                  </td>
                </tr>
              ) : (
                filteredAndSortedPlayers.map((player, index) => (
                  <tr
                    key={index}
                    className="border-b border-dark-border/50 hover:bg-dark-bg transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {player.headshotUrl ? (
                          <Image
                            src={player.headshotUrl}
                            alt={player.name}
                            width={40}
                            height={40}
                            className="rounded-lg"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-dark-border rounded-lg flex items-center justify-center">
                            <span className="text-gray-500 text-xs">N/A</span>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-white">{player.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="text-sm text-gray-300">{player.position}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-sm text-gray-400">{player.team}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-lg font-bold text-white">
                        ${player.avgAuctionValue}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
