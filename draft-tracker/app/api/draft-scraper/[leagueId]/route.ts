import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180 // Extended timeout for scraping (3 minutes to allow for login)

interface DraftPick {
  playerId: number
  playerName: string
  teamId: number
  pickNumber: number
  round: number
  bidAmount?: number
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
  let browser = null

  try {
    const { leagueId } = params

    // Get ESPN authentication cookies from environment
    const espnS2 = process.env.ESPN_S2 || ''
    const swid = process.env.ESPN_SWID || ''

    if (!espnS2 || !swid) {
      return NextResponse.json(
        { error: 'ESPN_S2 and ESPN_SWID must be set in .env.local for scraping' },
        { status: 401 }
      )
    }

    console.log('Starting Puppeteer scraper for league:', leagueId)

    // Launch browser - visible so we can debug
    browser = await puppeteer.launch({
      headless: false, // Make visible to debug
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Hide that we're automated
        '--window-size=1920,1080'
      ]
    })

    const page = await browser.newPage()

    // Set user agent to look like a real browser
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

    // Get the ESPN URL from query params (if provided) or construct it
    const espnUrlParam = request.nextUrl.searchParams.get('espnUrl')
    const draftUrl = espnUrlParam || `https://fantasy.espn.com/basketball/draft?leagueId=${leagueId}`
    console.log('Navigating to:', draftUrl)

    // First navigate to ESPN.com to set cookies properly
    await page.goto('https://espn.com', { waitUntil: 'networkidle2' })

    // Now set authentication cookies
    await page.setCookie(
      {
        name: 'espn_s2',
        value: espnS2,
        domain: '.espn.com',
        path: '/',
        httpOnly: true,
        secure: true
      },
      {
        name: 'SWID',
        value: swid,
        domain: '.espn.com',
        path: '/',
        httpOnly: false,
        secure: true
      }
    )

    console.log('Cookies set, navigating to draft page...')

    // Now navigate to the actual draft URL
    await page.goto(draftUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    })

    console.log('Draft page loaded, checking for login...')

    // Wait a moment for the page to settle
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check if we're actually on the draft page or need to login
    const pageStatus = await page.evaluate(() => {
      const hasPasswordInput = document.querySelector('input[type="password"]') !== null
      const hasEmailInput = document.querySelector('input[type="email"]') !== null
      const bodyText = document.body.innerText.toLowerCase()
      const hasLoginText = bodyText.includes('log in') || bodyText.includes('sign in') || bodyText.includes('login')
      const title = document.title.toLowerCase()
      const isErrorPage = bodyText.includes('error') || title.includes('error')

      // Check for draft-specific content
      const hasDraftContent = bodyText.includes('draft') && (
        bodyText.includes('roster') ||
        bodyText.includes('player') ||
        bodyText.includes('pick')
      )

      return {
        hasPasswordInput,
        hasEmailInput,
        hasLoginText,
        isErrorPage,
        hasDraftContent,
        title: document.title,
        bodyPreview: bodyText.substring(0, 200)
      }
    })

    console.log('Page status:', JSON.stringify(pageStatus, null, 2))

    const needsLogin = pageStatus.hasPasswordInput ||
                       pageStatus.hasEmailInput ||
                       pageStatus.hasLoginText ||
                       pageStatus.isErrorPage ||
                       !pageStatus.hasDraftContent

    if (needsLogin) {
      console.log('\n⚠️  ==========================================')
      console.log('⚠️  LOGIN REQUIRED!')
      console.log('⚠️  Please login in the browser window that just opened.')
      console.log('⚠️  You have 3 MINUTES to complete the login.')
      console.log('⚠️  The browser will stay open - take your time!')
      console.log('⚠️  ==========================================\n')

      // Wait up to 3 minutes for user to login
      let loginComplete = false
      const maxWaitTime = 180000 // 3 minutes
      const checkInterval = 3000 // Check every 3 seconds
      let waited = 0

      while (!loginComplete && waited < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval))
        waited += checkInterval

        // Check if we're now on a page with draft content
        const status = await page.evaluate(() => {
          const hasPasswordInput = document.querySelector('input[type="password"]') !== null
          const bodyText = document.body.innerText.toLowerCase()
          const hasDraftContent = bodyText.includes('draft') && (
            bodyText.includes('roster') ||
            bodyText.includes('player') ||
            bodyText.includes('pick')
          )
          return { hasPasswordInput, hasDraftContent }
        })

        loginComplete = !status.hasPasswordInput && status.hasDraftContent

        if (loginComplete) {
          console.log('✅ Login detected! Draft page loaded. Continuing...')
          // Give it a moment to fully load
          await new Promise(resolve => setTimeout(resolve, 5000))
          break
        }

        if (waited % 15000 === 0) { // Log every 15 seconds
          console.log(`⏳ Still waiting for login... (${waited/1000}s / ${maxWaitTime/1000}s)`)
        }
      }

      if (!loginComplete) {
        await browser.close()
        return NextResponse.json(
          { error: 'Login timeout - please try again. You have 3 minutes to login.' },
          { status: 408 }
        )
      }
    } else {
      console.log('✅ No login required, proceeding...')
      // Wait a bit for content to load
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    console.log('Looking for draft board / pick history...')

    // Try multiple methods to click on the "Board" tab
    const boardResult = await page.evaluate(() => {
      // Method 1: Look for Board tab by text content
      const allElements = Array.from(document.querySelectorAll('*'))
      const boardTab = allElements.find(el =>
        el.textContent?.trim() === 'Board' ||
        el.textContent?.trim() === 'board' ||
        el.textContent?.trim() === 'Pick History'
      )

      if (boardTab && boardTab instanceof HTMLElement) {
        console.log('Found Board tab via text search:', boardTab.className)
        boardTab.click()
        return { clicked: true, method: 'text search' }
      }

      // Method 2: Look for navigation tabs
      const navTabs = document.querySelectorAll('nav button, nav a, [role="tablist"] button, [role="tablist"] a')
      for (const tab of navTabs) {
        if (tab.textContent?.toLowerCase().includes('board')) {
          console.log('Found Board tab via nav:', tab.className)
          if (tab instanceof HTMLElement) {
            tab.click()
            return { clicked: true, method: 'nav search' }
          }
        }
      }

      return { clicked: false, tabs: Array.from(navTabs).map(t => t.textContent?.trim()) }
    })

    console.log('Board tab result:', JSON.stringify(boardResult, null, 2))

    if (boardResult.clicked) {
      console.log(`✅ Clicked Board tab (${boardResult.method}), waiting for board to load...`)
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait longer for board to render
    } else {
      console.log('⚠️  Could not find Board tab. Available tabs:', boardResult.tabs)
      console.log('Will try to scrape from current view...')
    }

    // Scroll down to trigger lazy-loaded content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Scroll back up
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Take a screenshot for debugging
    const screenshotPath = `/tmp/espn-draft-${leagueId}.png`
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`Screenshot saved to: ${screenshotPath}`)

    // Extract draft data from the page with extensive debugging
    const draftData = await page.evaluate(() => {
      const picks: any[] = []
      const debugInfo: any = {
        title: document.title,
        bodyClasses: document.body.className,
        allClasses: []
      }

      // Collect all unique class names on the page
      const allElements = document.querySelectorAll('*')
      const classSet = new Set<string>()
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls && (cls.includes('pick') || cls.includes('Pick') || cls.includes('player') || cls.includes('Player'))) {
              classSet.add(cls)
            }
          })
        }
      })
      debugInfo.relevantClasses = Array.from(classSet)

      // Method 1: Look for picks in various possible selectors
      // Prioritize selectors that worked for ESPN auction drafts
      const pickSelectors = [
        '[class*="completedPick"]', // Completed picks in the draft board
        '.draft-board-grid-pick-cell', // Draft board cells
        '[class*="Pick"]', // Generic pick elements (this worked before!)
        '[class*="auction-pick-component"]', // Auction-specific picks
        '[class*="picklist--pick"]', // Pick list items
        '[class*="picks"] [class*="pick-item"]',
        '[class*="PickItem"]',
        '[data-testid*="pick"]',
        '[class*="drafted"]',
        '[class*="Drafted"]'
      ]

      for (const selector of pickSelectors) {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements using selector: ${selector}`)
          debugInfo.workingSelector = selector
          debugInfo.elementCount = elements.length

          elements.forEach((pickEl, index) => {
            // For ESPN auction drafts, player names are split into firstName and lastName
            const firstNameEl = pickEl.querySelector('[class*="playerFirstName"]')
            const lastNameEl = pickEl.querySelector('[class*="playerLastName"]')

            let playerName = null

            if (firstNameEl && lastNameEl) {
              const firstName = firstNameEl.textContent?.trim() || ''
              const lastName = lastNameEl.textContent?.trim() || ''
              playerName = `${firstName} ${lastName}`.trim()
            }

            // Fallback to other selectors if the above didn't work
            if (!playerName) {
              const nameSelectors = [
                '[class*="playerinfo__playername"]',
                '[class*="player-name"]',
                '[class*="playerName"]',
                '.AnchorLink',
                'a[class*="player"]'
              ]

              for (const nameSelector of nameSelectors) {
                const nameEl = pickEl.querySelector(nameSelector)
                if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
                  playerName = nameEl.textContent.trim()
                  break
                }
              }
            }

            // Try multiple selectors for team
            const teamSelectors = [
              '[class*="playerProTeam"]',
              '[class*="playerinfo__playerteam"]',
              '[class*="team-abbrev"]',
              '[class*="teamAbbrev"]',
              '[class*="team-name"]'
            ]

            let teamName = 'Unknown'
            for (const teamSelector of teamSelectors) {
              const teamEl = pickEl.querySelector(teamSelector)
              if (teamEl && teamEl.textContent && teamEl.textContent.trim()) {
                teamName = teamEl.textContent.trim()
                break
              }
            }

            // Skip non-player entries like "Auto", "UTIL", etc.
            if (playerName && playerName.length > 2 && playerName.length < 100 &&
                !playerName.toUpperCase().includes('AUTO') &&
                !playerName.toUpperCase().includes('UTIL')) {
              picks.push({
                playerName,
                teamName,
                pickNumber: index + 1
              })
            }
          })

          if (picks.length > 0) {
            break
          }
        }
      }

      debugInfo.picksFound = picks.length

      return { picks, pickCount: picks.length, debug: debugInfo }
    })

    console.log('Extracted data:', JSON.stringify(draftData, null, 2))

    await browser.close()

    if (draftData.pickCount === 0) {
      console.error('No picks found!')
      console.error('Debug info:', JSON.stringify(draftData.debug, null, 2))
      return NextResponse.json(
        {
          error: 'No picks found on the page',
          debug: draftData.debug,
          details: `Checked ${draftData.debug.relevantClasses?.length || 0} relevant CSS classes. Page title: ${draftData.debug.title}. Screenshot saved to /tmp/espn-draft-${leagueId}.png`
        },
        { status: 500 }
      )
    }

    console.log(`Successfully extracted ${draftData.pickCount} picks`)

    // Transform the scraped data into our API format
    const picks: DraftPick[] = draftData.picks.map((pick: any, index: number) => ({
      playerId: index + 1, // Mock ID since we don't have real IDs from scraping
      playerName: pick.playerName,
      teamId: 0,
      pickNumber: pick.pickNumber,
      round: Math.floor(index / 10) + 1
    }))

    const response: DraftResponse = {
      picks,
      currentPick: picks.length + 1,
      totalPicks: 130,
      isComplete: false,
      teams: []
    }

    // Also save to the sync endpoint so the tracker page can access it
    try {
      const syncUrl = `${request.nextUrl.origin}/api/draft-sync/${leagueId}`
      console.log('Saving to sync endpoint:', syncUrl)
      await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picks: draftData.picks,
          teams: [],
          totalPicks: 130,
          isComplete: false,
          syncedAt: new Date().toISOString()
        })
      })
      console.log('✅ Saved scraped data to sync endpoint - tracker will now show picks!')
    } catch (syncError) {
      console.error('Failed to save to sync endpoint:', syncError)
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error scraping draft data:', error)

    if (browser) {
      await browser.close()
    }

    return NextResponse.json(
      {
        error: 'Failed to scrape draft data. The page structure may have changed.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
