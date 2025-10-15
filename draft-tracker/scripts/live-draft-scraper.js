const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const LEAGUE_ID = process.argv[2] || '72696047';
const TRACKER_URL = process.argv[3] || 'http://localhost:3001';
const CHECK_INTERVAL = 5000; // Check every 5 seconds

// Load environment variables
function loadEnvFile() {
  const envPath = path.join(__dirname, '../.env.local');

  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local file not found!');
    console.error('   Create it with your ESPN_S2 and ESPN_SWID cookies');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });

  return env;
}

async function scrapeLiveDraft() {
  console.log('🏀 ESPN Live Draft Scraper');
  console.log('========================\n');
  console.log(`League ID: ${LEAGUE_ID}`);
  console.log(`Tracker URL: ${TRACKER_URL}\n`);

  // Load ESPN cookies
  const env = loadEnvFile();
  const espnS2 = env.ESPN_S2;
  const swid = env.ESPN_SWID;

  if (!espnS2 || !swid) {
    console.error('❌ ESPN_S2 or ESPN_SWID not found in .env.local');
    console.error('   These are required to access your league draft');
    process.exit(1);
  }

  console.log('✅ Cookies loaded from .env.local');

  // Launch browser
  console.log('🌐 Launching browser...\n');
  const browser = await puppeteer.launch({
    headless: false, // Show browser so you can see what's happening
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Set ESPN cookies
  await page.setCookie(
    {
      name: 'espn_s2',
      value: espnS2,
      domain: '.espn.com',
    },
    {
      name: 'SWID',
      value: swid,
      domain: '.espn.com',
    }
  );

  console.log('🔐 Authenticated with ESPN cookies');

  // Navigate to draft page
  const draftUrl = `https://fantasy.espn.com/basketball/draft?leagueId=${LEAGUE_ID}`;
  console.log(`📍 Navigating to: ${draftUrl}\n`);

  try {
    await page.goto(draftUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
  } catch (error) {
    console.error('❌ Failed to load draft page:', error.message);
    await browser.close();
    process.exit(1);
  }

  console.log('✅ Draft page loaded');
  console.log('👀 Monitoring for picks...\n');
  console.log('Press Ctrl+C to stop\n');

  let lastPickCount = 0;
  let consecutiveErrors = 0;

  // Main monitoring loop
  while (true) {
    try {
      // Extract picks from the page
      const picks = await page.evaluate(() => {
        const picksList = [];

        // Method 1: Try to find picks in the right sidebar
        const pickElements = document.querySelectorAll('[class*="pick"], [class*="Pick"]');

        pickElements.forEach((pickEl, index) => {
          // Look for player name
          const nameSelectors = [
            '[class*="player-name"]',
            '[class*="playerName"]',
            '.player__name',
            '.AnchorLink'
          ];

          let playerName = null;
          for (const selector of nameSelectors) {
            const nameEl = pickEl.querySelector(selector);
            if (nameEl && nameEl.textContent.trim()) {
              playerName = nameEl.textContent.trim();
              break;
            }
          }

          // Look for team name
          const teamSelectors = [
            '[class*="team-abbrev"]',
            '[class*="teamAbbrev"]',
            '[class*="team-name"]'
          ];

          let teamName = 'Unknown';
          for (const selector of teamSelectors) {
            const teamEl = pickEl.querySelector(selector);
            if (teamEl && teamEl.textContent.trim()) {
              teamName = teamEl.textContent.trim();
              break;
            }
          }

          if (playerName) {
            picksList.push({
              playerName,
              teamName,
              pickNumber: index + 1
            });
          }
        });

        return picksList;
      });

      // If we found picks and the count changed
      if (picks.length > 0 && picks.length !== lastPickCount) {
        console.log(`\n📊 Found ${picks.length} picks (was ${lastPickCount})`);

        // Show the new picks
        if (picks.length > lastPickCount) {
          console.log('\n🆕 New picks:');
          picks.slice(lastPickCount).forEach(pick => {
            console.log(`   ${pick.pickNumber}. ${pick.playerName} → ${pick.teamName}`);
          });
        }

        // Send to tracker API
        try {
          const response = await fetch(`${TRACKER_URL}/api/draft-sync/${LEAGUE_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              picks,
              teams: [],
              totalPicks: 130,
              isComplete: false,
              syncedAt: new Date().toISOString()
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`✅ Synced ${data.pickCount} picks to tracker`);
            lastPickCount = picks.length;
            consecutiveErrors = 0;
          } else {
            console.error(`❌ Failed to sync: ${response.status}`);
            consecutiveErrors++;
          }
        } catch (fetchError) {
          console.error('❌ Failed to sync to tracker:', fetchError.message);
          console.error('   Is your tracker running at', TRACKER_URL, '?');
          consecutiveErrors++;
        }
      } else if (picks.length === 0 && lastPickCount === 0) {
        // First check, no picks found
        console.log('⏳ Waiting for draft to start or picks to appear...');
      }

      // Stop if too many consecutive errors
      if (consecutiveErrors > 10) {
        console.error('\n❌ Too many consecutive errors. Stopping.');
        break;
      }

    } catch (error) {
      console.error('❌ Error extracting picks:', error.message);
      consecutiveErrors++;
    }

    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }

  await browser.close();
  console.log('\n👋 Scraper stopped');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping scraper...');
  process.exit(0);
});

// Run the scraper
scrapeLiveDraft()
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
