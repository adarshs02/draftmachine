const fs = require('fs');

// Helper function to normalize player names for matching
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z\s]/g, '') // Remove non-letter characters except spaces
    .trim();
}

// Load both JSON files
console.log('Loading data files...');
const draftData = JSON.parse(fs.readFileSync('draft-data.json', 'utf8'));
const yahooData = JSON.parse(fs.readFileSync('yahoo-draft-data.json', 'utf8'));

console.log(`Loaded ${draftData.length} players from draft-data.json`);
console.log(`Loaded ${yahooData.length} players from yahoo-draft-data.json`);

// Create a map of Yahoo players by normalized name
const yahooMap = new Map();
yahooData.forEach(player => {
  const normalizedName = normalizeName(player.name);
  yahooMap.set(normalizedName, player.yahooAuctionValue);
});

// Merge the data
const mergedData = [];
let matchedCount = 0;
let unmatchedCount = 0;

draftData.forEach(player => {
  const normalizedName = normalizeName(player.name);
  const yahooValue = yahooMap.get(normalizedName);
  
  if (yahooValue !== undefined) {
    // Calculate average of both auction values
    const avgValue = (player.avgAuctionValue + yahooValue) / 2;
    
    mergedData.push({
      ...player,
      avgAuctionValue: Math.round(avgValue * 10) / 10, // Round to 1 decimal place
      espnAuctionValue: player.avgAuctionValue, // Keep original ESPN value
      yahooAuctionValue: yahooValue // Add Yahoo value
    });
    
    matchedCount++;
  } else {
    // No match found, keep original data
    mergedData.push({
      ...player,
      espnAuctionValue: player.avgAuctionValue,
      yahooAuctionValue: null
    });
    
    unmatchedCount++;
    console.log(`⚠️  No Yahoo match for: ${player.name}`);
  }
});

// Sort by avgAuctionValue descending
mergedData.sort((a, b) => b.avgAuctionValue - a.avgAuctionValue);

// Save merged data
fs.writeFileSync('merged-draft-data.json', JSON.stringify(mergedData, null, 2));

console.log('\n✅ Merge complete!');
console.log(`📊 Matched: ${matchedCount} players`);
console.log(`⚠️  Unmatched: ${unmatchedCount} players`);
console.log(`📁 Saved to: merged-draft-data.json`);

// Show top 10 players
console.log('\n🏀 Top 10 Players (by averaged auction value):');
console.table(mergedData.slice(0, 10).map(p => ({
  Name: p.name,
  Team: p.team,
  Position: p.position,
  'ESPN $': p.espnAuctionValue,
  'Yahoo $': p.yahooAuctionValue,
  'Avg $': p.avgAuctionValue
})));
