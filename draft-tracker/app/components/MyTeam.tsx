'use client'

import Image from 'next/image'

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
}

interface MyTeamProps {
  picks: DraftPick[]
  allPlayers: Player[]
  remainingBudget: number
  totalBudget: number
}

export default function MyTeam({ picks, allPlayers, remainingBudget, totalBudget }: MyTeamProps) {
  // Filter to only show my picks
  const myPicks = picks.filter(pick => pick.isMyPick)

  // Calculate total spent
  const totalSpent = myPicks.reduce((sum, pick) => sum + (pick.bidAmount || 0), 0)

  // Get player data for each pick
  const getPlayerData = (name: string): Player | null => {
    const normalized = name.toLowerCase().trim()
    return allPlayers.find(p =>
      p.name.toLowerCase().trim() === normalized ||
      p.name.toLowerCase().includes(normalized) ||
      normalized.includes(p.name.toLowerCase())
    ) || null
  }

  // Group by position
  const playersByPosition: Record<string, Array<DraftPick & { playerData: Player | null }>> = {}
  myPicks.forEach(pick => {
    const playerData = getPlayerData(pick.playerName)
    const position = playerData?.position || 'Unknown'
    if (!playersByPosition[position]) {
      playersByPosition[position] = []
    }
    playersByPosition[position].push({ ...pick, playerData })
  })

  const positions = Object.keys(playersByPosition).sort()

  return (
    <div className="space-y-4">
      {/* Budget Overview */}
      <div className="card">
        <h3 className="text-2xl font-bold mb-4">My Team</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-dark-bg rounded-lg">
            <div className="text-gray-400 text-sm mb-1">Total Budget</div>
            <div className="text-2xl font-bold text-white">${totalBudget}</div>
          </div>
          <div className="p-4 bg-dark-bg rounded-lg">
            <div className="text-gray-400 text-sm mb-1">Spent</div>
            <div className="text-2xl font-bold text-primary">${totalSpent}</div>
          </div>
          <div className="p-4 bg-dark-bg rounded-lg">
            <div className="text-gray-400 text-sm mb-1">Remaining</div>
            <div className={`text-2xl font-bold ${remainingBudget < 20 ? 'text-red-400' : 'text-green-400'}`}>
              ${remainingBudget}
            </div>
          </div>
        </div>
      </div>

      {/* Roster Requirements */}
      <div className="card bg-dark-bg/50">
        <h4 className="font-bold text-sm mb-3 text-gray-300">Roster Requirements (13 total)</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">PG:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">SG:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">SF:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">PF:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">C:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">G:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">F:</span>
            <span className="font-semibold">1</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">UTIL:</span>
            <span className="font-semibold">3</span>
          </div>
          <div className="flex justify-between px-2 py-1 bg-dark-card rounded">
            <span className="text-gray-400">Bench:</span>
            <span className="font-semibold">3</span>
          </div>
        </div>
      </div>

      {/* Roster */}
      {myPicks.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-gray-400 text-lg mb-2">No players yet</div>
          <p className="text-gray-500 text-sm">Start drafting to build your roster</p>
        </div>
      ) : (
        <>
          {/* Roster by Position */}
          {positions.map(position => (
            <div key={position} className="card">
              <h4 className="font-bold text-lg mb-3 text-primary">{position}</h4>
              <div className="space-y-2">
                {playersByPosition[position].map((pick) => {
                  const { playerData } = pick
                  return (
                    <div
                      key={pick.pickNumber}
                      className="flex items-center gap-3 p-3 bg-dark-bg rounded-lg"
                    >
                      {/* Pick Number */}
                      <div className="flex-shrink-0 w-10 text-center">
                        <div className="text-sm font-bold text-gray-400">
                          #{pick.pickNumber}
                        </div>
                      </div>

                      {/* Player Photo */}
                      {playerData?.headshotUrl ? (
                        <Image
                          src={playerData.headshotUrl}
                          alt={pick.playerName}
                          width={48}
                          height={48}
                          className="rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-dark-border rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-500 text-xs">N/A</span>
                        </div>
                      )}

                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white">{pick.playerName}</div>
                        {playerData && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{playerData.team}</span>
                            <span>•</span>
                            <span>Avg: ${playerData.avgAuctionValue}</span>
                          </div>
                        )}
                      </div>

                      {/* Salary */}
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xl font-bold text-primary">
                          ${pick.bidAmount || 0}
                        </div>
                        {playerData && pick.bidAmount && (
                          <div className="text-xs text-gray-500">
                            {pick.bidAmount > playerData.avgAuctionValue ? (
                              <span className="text-red-400">
                                +${(pick.bidAmount - playerData.avgAuctionValue).toFixed(0)}
                              </span>
                            ) : pick.bidAmount < playerData.avgAuctionValue ? (
                              <span className="text-green-400">
                                -${(playerData.avgAuctionValue - pick.bidAmount).toFixed(0)}
                              </span>
                            ) : (
                              <span>Value</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Summary Stats */}
          <div className="card">
            <h4 className="font-bold mb-3">Roster Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Players:</span>
                <span className="font-semibold">{myPicks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg Cost:</span>
                <span className="font-semibold">
                  ${myPicks.length > 0 ? (totalSpent / myPicks.length).toFixed(1) : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Budget Used:</span>
                <span className="font-semibold">
                  {((totalSpent / totalBudget) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Per Remaining:</span>
                <span className="font-semibold">
                  ${remainingBudget > 0 && myPicks.length < 13 ? (remainingBudget / (13 - myPicks.length)).toFixed(1) : 0}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
