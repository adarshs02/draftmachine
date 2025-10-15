const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeYahooDraftData() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: false 
  });
  
  const page = await browser.newPage();
  
  console.log('Going to Yahoo...');
  await page.goto('https://basketball.fantasysports.yahoo.com/nba/draftanalysis?type=salcap', {
    waitUntil: 'networkidle2'
  });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  let allPlayers = [];
  const maxPages = 10; // Increased to ensure we get 200+ players (10 pages * 30 = 300 players max)
  
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`\nScraping page ${pageNum}...`);
    
    // Wait for table to be fully loaded
    await page.waitForSelector('[data-tst="player-name"]', { timeout: 10000 }).catch(() => {
      console.log('  ⚠️  Warning: Player names not found on page');
    });
    
    // Get the pagination text before (e.g., "1-30")
    const paginationBefore = await page.evaluate(() => {
      // Look for text like "1-30" in the pagination area
      const paginationText = document.body.innerText.match(/(\d+-\d+)/);
      return paginationText ? paginationText[1] : '';
    });
    console.log(`  Pagination: ${paginationBefore}`);
    
    const firstPlayerBefore = await page.evaluate(() => {
      return document.querySelector('[data-tst="player-name"]')?.textContent || '';
    });
    console.log(`  First player: ${firstPlayerBefore}`);
    
    const players = await page.evaluate(() => {
      const data = [];
      const rows = document.querySelectorAll('tr');
      
      rows.forEach(row => {
        const nameElement = row.querySelector('[data-tst="player-name"]');
        
        if (nameElement) {
          const cells = row.querySelectorAll('td');
          let salary = null;
          
          cells.forEach(cell => {
            const text = cell.textContent.trim();
            if (/^\d+\.\d+$/.test(text)) {
              salary = parseFloat(text);
            }
          });
          
          if (salary !== null) {
            data.push({
              name: nameElement.textContent.trim(),
              yahooAuctionValue: salary
            });
          }
        }
      });
      
      return data;
    });
    
    console.log(`  Scraped ${players.length} players`);
    
    if (players.length > 0) {
      console.log(`  Sample: ${players[0].name} - $${players[0].yahooAuctionValue}`);
    }
    
    // Check for duplicates before adding
    const beforeCount = allPlayers.length;
    const newPlayers = players.filter(p => !allPlayers.some(existing => existing.name === p.name));
    allPlayers = allPlayers.concat(newPlayers);
    
    if (newPlayers.length < players.length) {
      console.log(`  ⚠️  Filtered out ${players.length - newPlayers.length} duplicate(s)`);
    }
    console.log(`  Running total: ${allPlayers.length} unique players`);
    
    // If we got no new players, we might be stuck on the same page
    if (newPlayers.length === 0 && pageNum > 1) {
      console.log('  ⚠️  No new players found, might be at the end or stuck');
      break;
    }
    
    // Click the right arrow
    if (pageNum < maxPages) {
      console.log('  Looking for right arrow...');
      
      // Check if we've reached the end (no more pages available)
      const nextButtonInfo = await page.evaluate(() => {
        // Look for caret-right button (Yahoo uses data-icon="caret-right")
        const rightCaretBtn = document.querySelector('button svg[data-icon="caret-right"]')?.closest('button');
        const leftCaretBtn = document.querySelector('button svg[data-icon="caret-left"]')?.closest('button');
        
        if (!rightCaretBtn) {
          return { found: false, disabled: true, leftFound: !!leftCaretBtn };
        }
        
        // Check if the button or SVG is disabled/grayed out
        const svg = rightCaretBtn.querySelector('svg');
        const fillColor = svg ? window.getComputedStyle(svg).fill : '';
        const isGrayedOut = fillColor.includes('rgb(189, 189, 189)') || fillColor.includes('rgba(189, 189, 189');
        
        return {
          found: true,
          disabled: rightCaretBtn.disabled || isGrayedOut,
          classes: rightCaretBtn.className,
          leftFound: !!leftCaretBtn,
          fillColor: fillColor
        };
      });
      
      console.log(`  Next button status: found=${nextButtonInfo.found}, disabled=${nextButtonInfo.disabled}, leftButton=${nextButtonInfo.leftFound}`);
      
      if (!nextButtonInfo.found) {
        console.log('  ❌ No next button found, stopping');
        break;
      }
      
      if (nextButtonInfo.disabled) {
        console.log('  ✓ Reached last page (next button disabled)');
        break;
      }
      
      // Click the caret-right button
      let clicked = false;
      
      try {
        // Find the button with caret-right SVG
        const rightCaretButton = await page.$('button svg[data-icon="caret-right"]');
        if (rightCaretButton) {
          const button = await page.evaluateHandle(el => el.closest('button'), rightCaretButton);
          await button.asElement().click();
          console.log('  ✓ Clicked caret-right button');
          clicked = true;
        }
      } catch (e) {
        console.log('  ⚠️  Puppeteer click failed, trying evaluate method');
      }
      
      // Fallback to evaluate-based click
      if (!clicked) {
        clicked = await page.evaluate(() => {
          const rightCaretBtn = document.querySelector('button svg[data-icon="caret-right"]')?.closest('button');
          if (rightCaretBtn && !rightCaretBtn.disabled) {
            rightCaretBtn.click();
            return true;
          }
          return false;
        });
        
        if (clicked) {
          console.log('  ✓ Clicked caret-right button via evaluate');
        }
      }
      
      if (!clicked) {
        console.log('  ❌ No right arrow found, stopping');
        break;
      }
      
      console.log('  ✓ Clicked arrow, waiting for table update...');
      
      // Add a small delay to let the click register
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Wait for pagination text or first player to change
      let changed = false;
      for (let attempt = 0; attempt < 60; attempt++) { // Increased to 60 (30 seconds max)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const currentState = await page.evaluate(() => {
          const paginationText = document.body.innerText.match(/(\d+-\d+)/);
          const firstPlayer = document.querySelector('[data-tst="player-name"]')?.textContent || '';
          const allPlayerNames = Array.from(document.querySelectorAll('[data-tst="player-name"]'))
            .map(el => el.textContent.trim())
            .join(',');
          return {
            pagination: paginationText ? paginationText[1] : '',
            firstPlayer: firstPlayer,
            allNames: allPlayerNames
          };
        });
        
        // Check if pagination changed OR first player changed OR the list of players changed
        if ((currentState.pagination && currentState.pagination !== paginationBefore) || 
            (currentState.firstPlayer && currentState.firstPlayer !== firstPlayerBefore)) {
          console.log(`  ✓ Table updated! New pagination: ${currentState.pagination}, New first player: ${currentState.firstPlayer}`);
          changed = true;
          break;
        }
        
        if (attempt % 10 === 0 && attempt > 0) {
          console.log(`  ... still waiting (${attempt * 0.5}s) - Pagination: ${currentState.pagination}, First: ${currentState.firstPlayer}`);
        }
      }
      
      if (!changed) {
        console.log('  ⚠️  Warning: Table did not update after 30 seconds');
        // Don't break, continue to next iteration to see if we get duplicates
      }
      
      // Extra wait to ensure table is fully rendered
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  console.log(`\n✅ Total Yahoo players: ${allPlayers.length}`);
  
  fs.writeFileSync('yahoo-draft-data.json', JSON.stringify(allPlayers, null, 2));
  console.log('📁 Data saved to yahoo-draft-data.json');
  
  await browser.close();
  return allPlayers;
}

scrapeYahooDraftData()
  .then(data => {
    console.log('\nFirst 5 players:');
    console.table(data.slice(0, 5));
    console.log(`\nLast 5 players:`);
    console.table(data.slice(-5));
  })
  .catch(error => {
    console.error('❌ Error:', error);
  });