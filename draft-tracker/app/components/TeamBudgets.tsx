'use client'

interface Team {
  name: string
  budget: number
  isMyTeam: boolean
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

interface TeamBudgetsProps {
  teams: Team[]
  picks: DraftPick[]
}

export default function TeamBudgets({ teams, picks }: TeamBudgetsProps) {
  // Calculate stats for each team
  const teamStats = teams.map(team => {
    const teamPicks = picks.filter(p => p.draftedByTeam === team.name)
    const totalSpent = teamPicks.reduce((sum, p) => sum + (p.bidAmount || 0), 0)
    const playerCount = teamPicks.length

    return {
      ...team,
      playerCount,
      totalSpent,
      avgPerPlayer: playerCount > 0 ? totalSpent / playerCount : 0
    }
  })

  // Sort: user's team first, then by remaining budget
  const sortedTeamStats = [...teamStats].sort((a, b) => {
    if (a.isMyTeam) return -1
    if (b.isMyTeam) return 1
    return b.budget - a.budget
  })

  const getBudgetColor = (budget: number) => {
    if (budget < 20) return 'text-red-400'
    if (budget < 50) return 'text-yellow-400'
    return 'text-green-400'
  }

  if (teams.length === 0) {
    return (
      <div className="card">
        <h3 className="font-bold text-lg mb-3">Team Budgets</h3>
        <p className="text-gray-400 text-sm text-center py-4">
          No teams configured yet
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="font-bold text-lg mb-4">Team Budgets</h3>

      <div className="space-y-3">
        {sortedTeamStats.map((team) => (
          <div
            key={team.name}
            className={`p-4 rounded-lg border transition-all ${
              team.isMyTeam
                ? 'bg-primary/10 border-primary/30'
                : 'bg-dark-bg border-dark-border'
            }`}
          >
            {/* Team Name & Badge */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${team.isMyTeam ? 'text-primary' : 'text-white'}`}>
                  {team.name}
                </span>
                {team.isMyTeam && (
                  <span className="px-2 py-0.5 text-xs bg-primary text-white rounded-full">
                    You
                  </span>
                )}
              </div>
              <div className={`text-lg font-bold ${getBudgetColor(team.budget)}`}>
                ${team.budget}
              </div>
            </div>

            {/* Team Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-500">Players</div>
                <div className="font-semibold text-gray-300">{team.playerCount}</div>
              </div>
              <div>
                <div className="text-gray-500">Spent</div>
                <div className="font-semibold text-gray-300">${team.totalSpent}</div>
              </div>
              <div>
                <div className="text-gray-500">Avg/Player</div>
                <div className="font-semibold text-gray-300">
                  ${team.playerCount > 0 ? Math.round(team.avgPerPlayer) : 0}
                </div>
              </div>
            </div>

            {/* Budget Bar */}
            <div className="mt-3">
              <div className="w-full bg-dark-border rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    team.budget < 20
                      ? 'bg-red-400'
                      : team.budget < 50
                      ? 'bg-yellow-400'
                      : 'bg-green-400'
                  }`}
                  style={{ width: `${(team.budget / 200) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-dark-border">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Total Teams</div>
            <div className="font-bold text-white">{teams.length}</div>
          </div>
          <div>
            <div className="text-gray-400">Total Picks</div>
            <div className="font-bold text-white">{picks.length}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
