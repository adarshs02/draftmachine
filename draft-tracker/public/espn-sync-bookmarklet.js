// ESPN Draft Sync Bookmarklet
// This extracts draft data from ESPN's page and sends it to your tracker

(function() {
  'use strict';

  // Configuration - prompt user for tracker URL
  const TRACKER_URL = prompt('Enter your draft tracker URL:', 'http://localhost:3000') || 'http://localhost:3000';

  // Extract league ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const leagueId = urlParams.get('leagueId');

  if (!leagueId) {
    alert('⚠️ Could not find league ID in URL. Make sure you\'re on the ESPN draft page.');
    return;
  }

  console.log('Extracting draft data for league:', leagueId);

  // Try to find picks in the DOM
  const picks = [];

  // Method 1: Look for picks in the picks panel (right side)
  const pickElements = document.querySelectorAll('[class*="picks"] [class*="pick-item"], [class*="PickItem"]');

  pickElements.forEach((pickEl, index) => {
    const playerName = pickEl.querySelector('[class*="player-name"], [class*="playerName"]')?.textContent?.trim();
    const teamName = pickEl.querySelector('[class*="team-abbrev"], [class*="teamAbbrev"]')?.textContent?.trim();

    if (playerName) {
      picks.push({
        playerName,
        teamName: teamName || 'Unknown',
        pickNumber: index + 1
      });
    }
  });

  // Method 2: Try to extract from React/Next.js data
  if (picks.length === 0 && window.__NEXT_DATA__) {
    console.log('Trying to extract from __NEXT_DATA__...');
    // ESPN might store draft data here - structure varies
  }

  // Method 3: Look for any elements containing player names
  if (picks.length === 0) {
    console.log('Trying alternative DOM selectors...');
    const alternativePickElements = document.querySelectorAll('[data-testid*="pick"], .Pick, .draft-pick');

    alternativePickElements.forEach((el, index) => {
      const text = el.textContent?.trim();
      if (text && text.length > 3 && text.length < 100) {
        picks.push({
          playerName: text,
          teamName: 'Unknown',
          pickNumber: index + 1
        });
      }
    });
  }

  if (picks.length === 0) {
    alert('⚠️ Could not find any picks on this page. The page structure may have changed.\n\nTry:\n1. Make sure the draft has started\n2. Check the browser console (F12) for errors\n3. Send a screenshot to help debug');
    console.error('No picks found. Page structure:', document.body.innerHTML.substring(0, 500));
    return;
  }

  console.log(`Found ${picks.length} picks, sending to tracker...`);

  // Send to tracker API
  fetch(`${TRACKER_URL}/api/draft-sync/${leagueId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      picks,
      teams: [],
      totalPicks: 130,
      isComplete: false,
      syncedAt: new Date().toISOString()
    })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert(`✅ Success! Synced ${data.pickCount} picks to your tracker.\n\nRefresh your tracker page to see updates.`);
      } else {
        alert('❌ Error: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      console.error('Sync error:', error);
      alert('❌ Failed to sync. Make sure your tracker is running at ' + TRACKER_URL);
    });
})();
