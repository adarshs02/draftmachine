# Fantasy Basketball Draft Tracker

A real-time ESPN fantasy basketball draft tracker with AI-powered recommendations using Claude AI.

## Features

- **Access Code Protection**: Secure access with a private code
- **Real-Time Draft Tracking**: Polls ESPN API every 5 seconds for live updates
- **AI Recommendations**: Claude AI suggests top 5 players to draft next
- **Player Data**: Comprehensive database with ESPN & Yahoo auction values
- **Live Draft Board**: Visual representation of all picks across teams
- **Recent Picks Feed**: See the latest picks with player photos and values
- **Draft Progress**: Track completion percentage and current pick

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** (Dark theme with orange accents)
- **Claude AI** (Anthropic API for recommendations)
- **ESPN API** (Real-time draft data)

## Prerequisites

- Node.js 18+
- npm or yarn
- Anthropic API key ([Get one here](https://console.anthropic.com/))

## Installation

1. **Clone and navigate to the project:**
   ```bash
   cd draft-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

4. **Change the access code (optional):**

   Open `app/page.tsx` and change the `ACCESS_CODE` constant on line 8:
   ```typescript
   const ACCESS_CODE = 'DRAFT2026' // Change this to your secret code
   ```

## Running the App

### Development Mode

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Usage

### 1. Access the App

- Navigate to `http://localhost:3000`
- Enter the access code (default: `DRAFT2026`)

### 2. Enter Draft Link

- Paste your ESPN draft URL
- Example: `https://fantasy.espn.com/basketball/draft?leagueId=724994858`
- Click "Start Tracking"

### 3. Track Your Draft

The app will:
- Auto-refresh every 5 seconds
- Show all picks in real-time
- Display a draft board grid
- Provide AI recommendations after each pick

## Project Structure

```
draft-tracker/
├── app/
│   ├── page.tsx                    # Home page with auth & URL input
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles & Tailwind
│   ├── draft/[leagueId]/
│   │   └── page.tsx                # Main draft tracker page
│   ├── api/
│   │   ├── draft/[leagueId]/
│   │   │   └── route.ts            # ESPN API proxy
│   │   └── recommendations/
│   │       └── route.ts            # Claude AI endpoint
│   └── components/
│       ├── LiveDraft.tsx           # Draft feed & board
│       └── Recommendations.tsx     # AI recommendations
├── public/
│   └── merged-draft-data.json      # Player database
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Configuration

### Access Code

Change the access code in `app/page.tsx`:
```typescript
const ACCESS_CODE = 'YOUR_SECRET_CODE'
```

### Polling Interval

Adjust refresh rate in `app/draft/[leagueId]/page.tsx`:
```typescript
const interval = setInterval(fetchDraftData, 5000) // 5 seconds
```

### Player Data

Update player data by replacing `public/merged-draft-data.json` with new data. Format:
```json
[
  {
    "name": "Nikola Jokic",
    "team": "Den",
    "position": "C",
    "avgAuctionValue": 83.7,
    "yahooAuctionValue": 87,
    "headshotUrl": "https://a.espncdn.com/..."
  }
]
```

## API Endpoints

### GET `/api/draft/[leagueId]`

Fetches current draft state from ESPN.

**Response:**
```json
{
  "picks": [
    {
      "playerId": 3112335,
      "playerName": "Nikola Jokic",
      "teamId": 1,
      "pickNumber": 1,
      "round": 1
    }
  ],
  "currentPick": 15,
  "totalPicks": 130,
  "isComplete": false,
  "teams": [
    { "id": 1, "name": "Team Name" }
  ]
}
```

### POST `/api/recommendations`

Gets AI recommendations from Claude.

**Request:**
```json
{
  "draftedPlayers": ["Nikola Jokic", ...],
  "availablePlayers": [{ "name": "...", "avgAuctionValue": 50 }]
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "name": "Shai Gilgeous-Alexander",
      "reasoning": "Elite point guard with high value..."
    }
  ]
}
```

## Troubleshooting

### "League not found" Error
- Verify your league ID is correct
- Make sure the league is set to 2026 season
- Check that the draft has started

### No Recommendations
- Verify `ANTHROPIC_API_KEY` is set correctly
- Check API key has available credits
- Look at server logs for errors

### Missing Player Photos
- Player photos come from ESPN's CDN
- Some players may not have photos available
- Check `headshotUrl` in player data

### Slow Performance
- Reduce polling interval (increase from 5s to 10s)
- Clear browser cache
- Check network connection

## Cost Estimates

### Claude API
- ~1,500 tokens per recommendation request
- ~$0.02-0.03 per request
- Typical draft (130 picks): ~$2.60-$3.90

### ESPN API
- Free, no authentication required
- Rate limits unknown (5s polling should be safe)

## Development

### Adding New Features

**Example: Add export functionality**
```typescript
// In app/draft/[leagueId]/page.tsx
const exportDraft = () => {
  const data = JSON.stringify(draftData, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `draft-${leagueId}.json`
  a.click()
}
```

### Styling

The app uses Tailwind with custom utility classes:
- `.btn-primary` - Primary button style
- `.btn-secondary` - Secondary button
- `.card` - Card container
- `.card-hover` - Hoverable card
- `.input-field` - Input styling

### Type Definitions

Key types in `app/draft/[leagueId]/page.tsx`:
- `Player` - Player data structure
- `DraftPick` - Individual pick
- `DraftData` - Complete draft state
- `Recommendation` - AI recommendation

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project to Vercel
3. Add `ANTHROPIC_API_KEY` environment variable
4. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## License

MIT

## Support

For issues or questions:
1. Check browser console for errors
2. Verify API keys are correct
3. Ensure draft is active on ESPN
4. Check that league ID is valid

---

**Built with Claude AI** - Providing intelligent draft recommendations for fantasy basketball managers.
