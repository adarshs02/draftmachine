import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SyncedPick {
  playerName: string
  teamName: string
  pickNumber: number
  bidAmount: number
  isMyPick: boolean
  draftedByTeam?: string
}

interface DraftTeam {
  name: string
  budget: number
  isMyTeam: boolean
}

// Use filesystem storage for persistence across server restarts
const CACHE_DIR = path.join(process.cwd(), '.draft-cache')

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function getCachePath(leagueId: string) {
  return path.join(CACHE_DIR, `${leagueId}.json`)
}

function saveToCache(leagueId: string, data: any) {
  const cachePath = getCachePath(leagueId)
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2))
}

function loadFromCache(leagueId: string) {
  const cachePath = getCachePath(leagueId)
  if (!fs.existsSync(cachePath)) {
    return null
  }
  const data = fs.readFileSync(cachePath, 'utf-8')
  return JSON.parse(data)
}

// Initialize teams for the draft
export async function POST(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params
    const { teams } = await request.json()

    if (!teams || !Array.isArray(teams)) {
      return NextResponse.json(
        { error: 'teams array is required' },
        { status: 400 }
      )
    }

    console.log('Initializing draft for league:', leagueId)
    console.log('Teams:', teams.length)

    // Initialize draft with teams
    const cacheData = {
      picks: [],
      teams: teams.map((team: DraftTeam) => ({
        name: team.name,
        budget: team.budget || 200,
        isMyTeam: team.isMyTeam || false
      })),
      syncedAt: new Date().toISOString(),
      totalPicks: 130,
      isComplete: false,
      myTeamBudget: 200
    }

    saveToCache(leagueId, cacheData)
    console.log(`Initialized draft with ${teams.length} teams`)

    return NextResponse.json({
      success: true,
      message: 'Draft initialized successfully',
      teams: cacheData.teams
    })
  } catch (error) {
    console.error('Error initializing draft:', error)
    return NextResponse.json(
      { error: 'Failed to initialize draft' },
      { status: 500 }
    )
  }
}

// Add a single pick manually
export async function PUT(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params
    const { playerName, bidAmount, isMyPick = false, draftedByTeam } = await request.json()

    if (!playerName || bidAmount === undefined) {
      return NextResponse.json(
        { error: 'playerName and bidAmount are required' },
        { status: 400 }
      )
    }

    // Load existing data
    const existingData = loadFromCache(leagueId) || {
      picks: [],
      teams: [],
      syncedAt: new Date().toISOString(),
      totalPicks: 130,
      isComplete: false,
      myTeamBudget: 200
    }

    // Initialize budget if not present (legacy support)
    if (existingData.myTeamBudget === undefined) {
      existingData.myTeamBudget = 200
    }

    // Find the team and deduct from their budget
    if (draftedByTeam && existingData.teams && existingData.teams.length > 0) {
      const teamIndex = existingData.teams.findIndex((t: DraftTeam) => t.name === draftedByTeam)
      if (teamIndex !== -1) {
        existingData.teams[teamIndex].budget -= bidAmount

        // Also update myTeamBudget if this is my team
        if (existingData.teams[teamIndex].isMyTeam) {
          existingData.myTeamBudget -= bidAmount
        }
      }
    } else if (isMyPick) {
      // Legacy support: deduct from myTeamBudget if no teams setup
      existingData.myTeamBudget -= bidAmount
    }

    // Add the new pick
    const newPickNumber = existingData.picks.length + 1
    const newPick: SyncedPick = {
      playerName,
      teamName: isMyPick ? 'My Team' : 'Manual',
      pickNumber: newPickNumber,
      bidAmount,
      isMyPick,
      draftedByTeam: draftedByTeam || (isMyPick ? 'My Team' : undefined)
    }

    existingData.picks.push(newPick)
    existingData.syncedAt = new Date().toISOString()

    // Save updated data
    saveToCache(leagueId, existingData)

    console.log(`Added pick #${newPickNumber}: ${playerName} for $${bidAmount}${isMyPick ? ' (My Team)' : ''}`)

    return NextResponse.json({
      success: true,
      pick: newPick,
      totalPicks: existingData.picks.length,
      myTeamBudget: existingData.myTeamBudget
    })
  } catch (error) {
    console.error('Error adding manual pick:', error)
    return NextResponse.json(
      { error: 'Failed to add pick' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params
    const cachedData = loadFromCache(leagueId)

    if (!cachedData) {
      return NextResponse.json(
        {
          picks: [],
          teams: [],
          currentPick: 1,
          totalPicks: 130,
          isComplete: false,
          synced: false,
          myTeamBudget: 200
        },
        { status: 200 }
      )
    }

    // Initialize budget if not present
    if (cachedData.myTeamBudget === undefined) {
      cachedData.myTeamBudget = 200
    }

    // Transform picks to match the format expected by the tracker
    const transformedPicks = cachedData.picks.map((pick: any, index: number) => ({
      playerId: index + 1,
      playerName: pick.playerName,
      teamId: 0,
      pickNumber: pick.pickNumber || index + 1,
      round: Math.floor(index / 10) + 1,
      bidAmount: pick.bidAmount || 0,
      isMyPick: pick.isMyPick || false,
      draftedByTeam: pick.draftedByTeam
    }))

    return NextResponse.json({
      picks: transformedPicks,
      teams: cachedData.teams || [],
      currentPick: transformedPicks.length + 1,
      totalPicks: cachedData.totalPicks,
      isComplete: cachedData.isComplete,
      synced: true,
      syncedAt: cachedData.syncedAt,
      myTeamBudget: cachedData.myTeamBudget,
      teamsConfigured: cachedData.teams && cachedData.teams.length > 0
    })
  } catch (error) {
    console.error('Error fetching synced draft data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch draft data' },
      { status: 500 }
    )
  }
}

// Reset draft - delete all picks
export async function DELETE(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  try {
    const { leagueId } = params
    const cachePath = getCachePath(leagueId)

    // Delete the cache file if it exists
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
      console.log(`Deleted draft data for league: ${leagueId}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Draft reset successfully'
    })
  } catch (error) {
    console.error('Error resetting draft:', error)
    return NextResponse.json(
      { error: 'Failed to reset draft' },
      { status: 500 }
    )
  }
}
