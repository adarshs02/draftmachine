import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

interface MyTeamPlayer {
  playerName: string
  position: string
  bidAmount: number
  avgValue: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { draftedPlayers, availablePlayers, myTeam, remainingBudget, totalBudget } = body

    if (!draftedPlayers || !availablePlayers) {
      return NextResponse.json(
        { error: 'Missing required data' },
        { status: 400 }
      )
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      )
    }

    // Get top 30 available players by auction value
    const topAvailable = availablePlayers
      .sort((a: Player, b: Player) => (b.avgAuctionValue || 0) - (a.avgAuctionValue || 0))
      .slice(0, 30)
      .map((p: Player) => ({
        name: p.name,
        team: p.team,
        position: p.position,
        avgValue: p.avgAuctionValue,
        yahooValue: p.yahooAuctionValue
      }))

    // Analyze roster composition
    const myRoster = myTeam || []
    const positionCounts: Record<string, number> = {}
    const totalSpent = myRoster.reduce((sum: number, p: MyTeamPlayer) => sum + p.bidAmount, 0)

    myRoster.forEach((p: MyTeamPlayer) => {
      positionCounts[p.position] = (positionCounts[p.position] || 0) + 1
    })

    const rosterAnalysis = myRoster.length > 0 ? `
MY CURRENT ROSTER (${myRoster.length} players, $${totalSpent} spent, $${remainingBudget} remaining):
${myRoster.map((p: MyTeamPlayer) => `- ${p.playerName} (${p.position}) - $${p.bidAmount} [Avg: $${p.avgValue}]`).join('\n')}

POSITION BREAKDOWN:
${Object.entries(positionCounts).map(([pos, count]) => `- ${pos}: ${count}`).join('\n')}
` : `
MY CURRENT ROSTER: Empty (${remainingBudget}/${totalBudget} budget remaining)
`

    // Get today's date for the prompt
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const prompt = `You are a fantasy basketball draft expert with real-time search capabilities. Today's date is ${today}. Analyze the user's roster and recommend the top 5 players to target next.

ROSTER REQUIREMENTS (13 total): 1 PG, 1 SG, 1 SF, 1 PF, 1 C, 1 G, 1 F, 3 UTIL, 3 Bench

${rosterAnalysis}

ALREADY DRAFTED BY ALL TEAMS (${draftedPlayers.length} players):
${draftedPlayers.slice(0, 50).map((p: string) => `- ${p}`).join('\n')}${draftedPlayers.length > 50 ? '\n... and more' : ''}

TOP AVAILABLE PLAYERS (sorted by average auction value):
${JSON.stringify(topAvailable, null, 2)}

ANALYSIS CRITERIA:
1. Position Needs: Analyze position gaps based on roster requirements (1 PG, 1 SG, 1 SF, 1 PF, 1 C, 1 G, 1 F, 3 UTIL, 3 Bench). Prioritize filling required positions before UTIL/Bench
2. Budget Strategy: With $${remainingBudget} remaining and ${13 - myRoster.length} spots left (out of 13 total), what's the optimal price range per remaining pick?
3. Value Picks: Which players offer the best value relative to their auction price?
4. Stat Balance: What specific stats (PPG, rebounds, assists, steals, blocks, FG%, 3PM, FT%, turnovers) does this roster need most?
5. Recent Performance: Search for recent tweets (from ${today}) from fantasy basketball experts (e.g., @JoshLloydNBA, @BaskMonster, @RotoProfessor, @DanTitus, @HalfCourtHoops) about these players' production, injuries, and upside
6. Upside & Trends: Which players are trending up based on recent news and expert opinions?

IMPORTANT: Use your search capabilities to find:
- Recent fantasy expert tweets about available players (search Twitter for dates around ${today})
- Latest injury news and rotation changes
- Recent game performance and trending stats
- Expert consensus on breakout candidates

Respond with EXACTLY 5 player recommendations in this JSON format:
{
  "recommendations": [
    {
      "name": "Player Name",
      "reasoning": "Comprehensive explanation including: 1) Why this fits roster needs & what stats they provide, 2) Recent expert tweets/opinions about their production, 3) Value at suggested price, 4) Any trending upside or recent news",
      "suggestedPrice": 25
    }
  ]
}

Important:
- Only recommend players from the TOP AVAILABLE PLAYERS list above
- Use exact names as they appear
- Include recent expert opinions and tweets in your reasoning when available
- SuggestedPrice should be realistic based on avgValue and remaining budget
- Focus on roster construction, stat categories needed, and real-time fantasy insights`

    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Fantasy Basketball Draft Tracker'
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4-fast', // Grok 4
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 3000,
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('OpenRouter API error:', errorData)
      throw new Error(`OpenRouter API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('No content in OpenRouter response')
    }

    // Parse AI response
    let recommendations: Recommendation[]
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      const parsed = JSON.parse(jsonMatch[0])
      recommendations = parsed.recommendations

      if (!Array.isArray(recommendations) || recommendations.length === 0) {
        throw new Error('Invalid recommendations format')
      }
    } catch (parseError) {
      console.error('Parse error:', parseError)
      console.error('Response content:', content)
      return NextResponse.json(
        { error: 'Failed to parse recommendations' },
        { status: 500 }
      )
    }

    return NextResponse.json({ recommendations })
  } catch (error: any) {
    console.error('Error getting recommendations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get recommendations' },
      { status: 500 }
    )
  }
}
