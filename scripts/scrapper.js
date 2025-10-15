const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeESPNDraftData() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: false 
  });
  
  const page = await browser.newPage();
  
  console.log('Going to ESPN...');
  await page.goto('https://fantasy.espn.com/basketball/livedraftresults', {
    waitUntil: 'networkidle2'
  });
  
  await page.waitForSelector('tr.Table__TR');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  let allPlayers = [];
  const maxPages = 4;
  
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`\nScraping page ${pageNum}...`);
    
    const firstPlayerBefore = await page.evaluate(() => {
      return document.querySelector('.AnchorLink')?.textContent || '';
    });
    console.log(`  First player: ${firstPlayerBefore}`);
    
    // Scrape current page
    const players = await page.evaluate(() => {
      const data = [];
      const rows = document.querySelectorAll('tr.Table__TR');
      
      rows.forEach(row => {
        const nameElement = row.querySelector('.AnchorLink');
        const avcElement = row.querySelector('.avc');
        const teamElement = row.querySelector('.playerinfo__playerteam');
        const posElement = row.querySelector('.playerinfo__playerpos');
        const headshotElement = row.querySelector('.player-headshot img'); // Get headshot
        
        if (nameElement && avcElement) {
          data.push({
            name: nameElement.textContent.trim(),
            team: teamElement?.textContent.trim() || '',
            position: posElement?.textContent.trim() || '',
            avgAuctionValue: parseFloat(avcElement.textContent.trim()) || 0,
            headshotUrl: headshotElement?.src || '' // Add headshot URL
          });
        }
      });
      
      return data;
    });
    
    console.log(`  Scraped ${players.length} players`);
    allPlayers = allPlayers.concat(players);
    
    // Click next if not on last page
    if (pageNum < maxPages) {
      const hasNext = await page.evaluate(() => {
        const nextBtn = document.querySelector('button[class*="Pagination"][class*="next"]:not([disabled])');
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });
      
      if (!hasNext) {
        console.log('  No next button, stopping');
        break;
      }
      
      console.log('  Clicked next, waiting...');
      
      // Wait for content to change
      let changed = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const firstPlayerAfter = await page.evaluate(() => {
          return document.querySelector('.AnchorLink')?.textContent || '';
        });
        
        if (firstPlayerAfter !== firstPlayerBefore) {
          console.log(`  Page changed! New first player: ${firstPlayerAfter}`);
          changed = true;
          break;
        }
      }
      
      if (!changed) {
        console.log('  Warning: Page may not have changed');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n✅ Total scraped: ${allPlayers.length} players`);
  
  fs.writeFileSync('draft-data.json', JSON.stringify(allPlayers, null, 2));
  console.log('📁 Data saved to draft-data.json');
  
  await browser.close();
  return allPlayers;
}

scrapeESPNDraftData()
  .then(data => {
    console.log('\nFirst 5 players:');
    console.table(data.slice(0, 5));
    console.log(`\nLast 5 players:`);
    console.table(data.slice(-5));
  })
  .catch(error => {
    console.error('❌ Error:', error);
  });