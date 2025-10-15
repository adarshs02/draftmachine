import Image from 'next/image'

interface Player {
  name: string
  team: string
  position: string
  avgAuctionValue: number
  yahooAuctionValue: number | null
  headshotUrl: string
}

interface Recommendation {
  name: string
  reasoning: string
  suggestedPrice?: number
}

interface RecommendationsProps {
  recommendations: Recommendation[]
  allPlayers: Player[]
  isLoading: boolean
  onRefresh: () => void
}

export default function Recommendations({
  recommendations,
  allPlayers,
  isLoading,
  onRefresh
}: RecommendationsProps) {
  const getValueColor = (value: number) => {
    if (value >= 50) return 'text-red-400'
    if (value >= 30) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getPlayerData = (name: string): Player | null => {
    return allPlayers.find(p => p.name.toLowerCase() === name.toLowerCase()) || null
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span className="text-primary">🤖</span> AI Recommendations
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-xs">Updating...</span>
            </div>
          )}
        </h2>
        <button
          onClick={onRefresh}
          className="text-sm text-gray-400 hover:text-primary transition-colors flex items-center gap-1"
          disabled={isLoading}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {recommendations.length === 0 && !isLoading ? (
        <div className="card text-center py-8">
          <p className="text-gray-400">No recommendations yet</p>
          <button onClick={onRefresh} className="btn-primary mt-4">
            Get Recommendations
          </button>
        </div>
      ) : recommendations.length === 0 && isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-20 bg-dark-border rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className={`space-y-3 ${isLoading ? 'opacity-60' : 'opacity-100'} transition-opacity duration-300`}>
          {recommendations.map((rec, index) => {
            const playerData = getPlayerData(rec.name)

            return (
              <div key={index} className="card-hover animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      #{index + 1}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{rec.name}</h3>
                        {playerData && (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>{playerData.team}</span>
                            <span>•</span>
                            <span>{playerData.position}</span>
                          </div>
                        )}
                      </div>

                      {playerData?.headshotUrl && (
                        <Image
                          src={playerData.headshotUrl}
                          alt={rec.name}
                          width={48}
                          height={48}
                          className="rounded-lg"
                        />
                      )}
                    </div>

                    <div className="flex gap-4 mb-2 text-sm flex-wrap">
                      {rec.suggestedPrice && (
                        <div className="px-3 py-1 bg-primary/20 rounded-lg border border-primary/30">
                          <span className="text-gray-400">Suggested: </span>
                          <span className="font-bold text-primary text-base">
                            ${rec.suggestedPrice}
                          </span>
                        </div>
                      )}
                      {playerData && (
                        <div>
                          <span className="text-gray-400">Avg: </span>
                          <span className="font-semibold text-white">
                            ${playerData.avgAuctionValue}
                          </span>
                        </div>
                      )}
                      {playerData?.yahooAuctionValue && (
                        <div>
                          <span className="text-gray-400">Yahoo: </span>
                          <span className="font-semibold text-white">${playerData.yahooAuctionValue}</span>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-gray-300 leading-relaxed">
                      {rec.reasoning}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="text-xs text-gray-500 text-center pt-2">
        Powered by Grok AI with real-time search • Refreshes automatically after each pick
      </div>
    </div>
  )
}
