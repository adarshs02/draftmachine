import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DraftPick {
  playerId: number
  playerName: string
  teamId: number
  pickNumber: number
  round: number
}

interface DraftResponse {
  picks: DraftPick[]
  currentPick: number
  totalPicks: number
  isComplete: boolean
  teams: Array<{ id: number; name: string }>
}

export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params

    // Get ESPN authentication cookies from environment or query params
    const espnS2 = process.env.ESPN_S2 || request.nextUrl.searchParams.get('espn_s2') || ''
    const swid = process.env.ESPN_SWID || request.nextUrl.searchParams.get('swid') || ''

    // Fetch from ESPN API - include mRoster view for auction draft player assignments
    // For live drafts, we may need to hit the live draft endpoint instead
    const espnUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2026/segments/0/leagues/${leagueId}?view=mDraftDetail&view=mRoster&view=mTeam&view=mLiveScoring&view=mMatchupScore`

    // Build cookie header for private leagues
    const cookies = []
    if (espnS2) cookies.push(`espn_s2=${espnS2}`)
    if (swid) cookies.push(`SWID=${swid}`)

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ')
    }

    const response = await fetch(espnUrl, {
      headers,
      // Cache for 5 seconds to avoid hammering ESPN
      next: { revalidate: 5 }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'League not found. Check your league ID.' },
          { status: 404 }
        )
      }
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Private league detected. Please add ESPN_S2 and ESPN_SWID to your .env.local file or make your league public.' },
          { status: 401 }
        )
      }
      throw new Error(`ESPN API returned ${response.status}`)
    }

    const data = await response.json()

    // Debug: Log the structure we're receiving
    console.log('ESPN API Response Keys:', Object.keys(data))
    console.log('Draft Detail:', data.draftDetail ? 'Present' : 'Missing')
    if (data.draftDetail) {
      console.log('Draft Detail Keys:', Object.keys(data.draftDetail))
      console.log('Draft Detail drafted status:', data.draftDetail.drafted)
      console.log('Draft Detail inProgress:', data.draftDetail.inProgress)
    }
    console.log('Settings:', data.settings ? JSON.stringify(data.settings.draftSettings || {}) : 'Missing')
    console.log('Players data:', data.players ? `${data.players.length} players` : 'Missing')
    console.log('Teams data:', data.teams ? `${data.teams.length} teams` : 'Missing')

    // Extract draft picks - ONLY count picks that have actually been made
    const picks: DraftPick[] = []
    const isAuctionDraft = data.settings?.draftSettings?.type === 'AUCTION'

    if (data.draftDetail && data.draftDetail.picks) {
      console.log(`Found ${data.draftDetail.picks.length} pick slots in draftDetail`)
      console.log(`Draft type: ${isAuctionDraft ? 'AUCTION' : 'SNAKE'}`)

      // Log first 3 picks to see structure
      console.log('Sample pick data:', JSON.stringify(data.draftDetail.picks.slice(0, 3), null, 2))

      // Check if any picks have been made at all
      const picksWithPlayers = data.draftDetail.picks.filter((p: any) => p.playerId > 0)
      console.log(`Picks with valid playerId: ${picksWithPlayers.length}`)
      if (picksWithPlayers.length > 0) {
        console.log('Sample actual pick:', JSON.stringify(picksWithPlayers[0], null, 2))
      }

      for (const pick of data.draftDetail.picks) {
        // For auction drafts, check if bid amount is set (> 0)
        // For snake drafts, check if playerId and teamId are not -1
        const isValidPick = isAuctionDraft
          ? (pick.bidAmount > 0 && pick.playerId > 0 && pick.teamId > 0)
          : (pick.playerId !== -1 && pick.teamId !== -1 && pick.playerId > 0)

        if (!isValidPick) {
          continue
        }

        // Get player name from members array
        let playerName = 'Unknown Player'
        if (data.players) {
          const player = data.players.find((p: any) => p.id === pick.playerId)
          if (player) {
            playerName = player.player?.fullName || player.player?.firstName + ' ' + player.player?.lastName || 'Unknown'
          }
        }

        picks.push({
          playerId: pick.playerId,
          playerName,
          teamId: pick.teamId,
          pickNumber: pick.overallPickNumber || picks.length + 1,
          round: pick.roundId || Math.floor(picks.length / (data.settings?.size || 10)) + 1
        })
      }

      console.log(`Filtered to ${picks.length} actual picks made`)

      // For auction drafts with no picks detected, check team rosters as fallback
      if (isAuctionDraft && picks.length === 0 && data.teams) {
        console.log('Checking team rosters for drafted players...')

        // Log first team structure to see what fields are available
        if (data.teams[0]) {
          console.log('First team structure:', JSON.stringify(Object.keys(data.teams[0]), null, 2))
          console.log('First team full data:', JSON.stringify(data.teams[0], null, 2))
        }

        let rosterCount = 0
        for (const team of data.teams) {
          if (team.roster?.entries) {
            rosterCount += team.roster.entries.length
            console.log(`Team ${team.id} has ${team.roster.entries.length} players on roster`)
          } else {
            console.log(`Team ${team.id} has no roster.entries field`)
          }
        }
        console.log(`Total roster entries across all teams: ${rosterCount}`)
      }
    } else {
      console.log('No draftDetail.picks found in response')
    }

    // Get team information
    const teams = data.teams?.map((team: any) => ({
      id: team.id,
      name: team.name || team.location + ' ' + team.nickname || `Team ${team.id}`
    })) || []

    // Determine draft status
    const teamCount = data.settings?.size || data.teams?.length || 10
    const roundCount = data.settings?.draftSettings?.rounds || 13
    const totalPicks = teamCount * roundCount
    const currentPick = picks.length + 1

    // Check multiple indicators for draft completion
    const isComplete = (
      picks.length >= totalPicks ||
      data.draftDetail?.drafted === true ||
      data.status?.currentMatchupPeriod > 0 // Season has started
    )

    console.log(`Draft Status: ${picks.length}/${totalPicks} picks, Complete: ${isComplete}`)
    console.log(`Team count: ${teamCount}, Rounds: ${roundCount}`)
    console.log(`Current matchup period: ${data.status?.currentMatchupPeriod || 'unknown'}`)

    const draftResponse: DraftResponse = {
      picks,
      currentPick: isComplete ? totalPicks : currentPick,
      totalPicks,
      isComplete,
      teams
    }

    return NextResponse.json(draftResponse, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    })
  } catch (error) {
    console.error('Error fetching draft data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch draft data. Please try again.' },
      { status: 500 }
    )
  }
}
