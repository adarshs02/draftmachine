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
  draftedByTeam?: string
}

interface Team {
  name: string
  budget: number
  isMyTeam: boolean
}

interface LiveDraftProps {
  picks: DraftPick[]
  allPlayers: Player[]
  currentPick: number
  totalPicks: number
  isComplete: boolean
  teams: Team[]
}

export default function LiveDraft({
  picks,
  allPlayers,
  currentPick,
  totalPicks,
  isComplete,
  teams
}: LiveDraftProps) {
  const getPlayerData = (name: string): Player | null => {
    // Fuzzy match player name
    const normalized = name.toLowerCase().trim()
    return allPlayers.find(p =>
      p.name.toLowerCase().trim() === normalized ||
      p.name.toLowerCase().includes(normalized) ||
      normalized.includes(p.name.toLowerCase())
    ) || null
  }

  const getValueColor = (value: number) => {
    if (value >= 50) return 'text-red-400'
    if (value >= 30) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getTeamName = (teamId: number) => {
    // Fallback for legacy picks without draftedByTeam
    return `Team ${teamId}`
  }

  // Sort picks by pick number (most recent first for display)
  const sortedPicks = [...picks].sort((a, b) => b.pickNumber - a.pickNumber)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">
              {isComplete ? 'Draft Complete!' : 'Live Draft'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Pick {currentPick} of {totalPicks}
              {!isComplete && (
                <span className="ml-2">
                  <span className="inline-block w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="ml-1">Live</span>
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">
              {picks.length}
            </div>
            <div className="text-xs text-gray-400">Picks Made</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="w-full bg-dark-border rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${(picks.length / totalPicks) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent Picks */}
      <div className="card">
        <h3 className="font-bold text-lg mb-4">Recent Picks</h3>

        {picks.length === 0 ? (
          <div className="text-center py-4 text-gray-400">
            <p>No picks yet. Waiting for draft to start...</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {sortedPicks.slice(0, 10).map((pick) => {
              const playerData = getPlayerData(pick.playerName)

              return (
                <div
                  key={pick.pickNumber}
                  className="flex items-center gap-3 p-3 bg-dark-bg rounded-lg hover:bg-dark-border transition-colors animate-fade-in"
                >
                  {/* Pick Number */}
                  <div className="flex-shrink-0 w-12 text-center">
                    <div className="text-lg font-bold text-primary">
                      #{pick.pickNumber}
                    </div>
                    <div className="text-xs text-gray-500">R{pick.round}</div>
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
                    <div className="font-semibold truncate">{pick.playerName}</div>
                    {playerData && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{playerData.team}</span>
                        <span>•</span>
                        <span>{playerData.position}</span>
                        <span>•</span>
                        <span className={getValueColor(playerData.avgAuctionValue)}>
                          Avg: ${playerData.avgAuctionValue}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Salary */}
                  {pick.bidAmount !== undefined && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xl font-bold text-primary">
                        ${pick.bidAmount}
                      </div>
                      {playerData && pick.bidAmount > 0 && (
                        <div className="text-xs text-gray-500">
                          {pick.bidAmount > playerData.avgAuctionValue ? (
                            <span className="text-red-400">+${(pick.bidAmount - playerData.avgAuctionValue).toFixed(0)}</span>
                          ) : pick.bidAmount < playerData.avgAuctionValue ? (
                            <span className="text-green-400">-${(playerData.avgAuctionValue - pick.bidAmount).toFixed(0)}</span>
                          ) : (
                            <span className="text-gray-400">Value</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Team */}
                  <div className="flex-shrink-0 text-right text-sm ml-3">
                    <div className="text-gray-300 font-medium">
                      {pick.draftedByTeam || getTeamName(pick.teamId)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {picks.length > 10 && (
          <div className="text-center text-sm text-gray-500 mt-3">
            Showing 10 most recent picks
          </div>
        )}
      </div>

      {/* Draft Board Preview */}
      {teams.length > 0 && picks.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-lg mb-4">Draft Board</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left p-2 text-gray-400 font-medium">Round</th>
                  {teams.map(team => (
                    <th key={team.name} className="text-left p-2 text-gray-400 font-medium truncate max-w-[100px]">
                      {team.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...Array(5)].map((_, roundIndex) => {
                  const round = roundIndex + 1
                  return (
                    <tr key={round} className="border-b border-dark-border/50">
                      <td className="p-2 font-bold text-primary">{round}</td>
                      {teams.map(team => {
                        const pick = picks.find(p => p.round === round && p.draftedByTeam === team.name)
                        return (
                          <td key={team.name} className="p-2 max-w-[100px]">
                            {pick ? (
                              <div className="truncate text-gray-300" title={pick.playerName}>
                                {pick.playerName}
                              </div>
                            ) : (
                              <div className="text-gray-600">-</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
