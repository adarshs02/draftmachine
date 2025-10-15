'use client'

export default function SyncSetup() {
  const bookmarkletCode = `javascript:(function(){const t=prompt('Enter your draft tracker URL:','http://localhost:3000')||'http://localhost:3000',e=new URLSearchParams(window.location.search).get('leagueId');if(!e)return void alert('⚠️ Could not find league ID in URL. Make sure you\\'re on the ESPN draft page.');console.log('Extracting draft data for league:',e);const n=[];if(document.querySelectorAll('[class*="picks"] [class*="pick-item"], [class*="PickItem"]').forEach((t,e)=>{const o=t.querySelector('[class*="player-name"], [class*="playerName"]')?.textContent?.trim(),c=t.querySelector('[class*="team-abbrev"], [class*="teamAbbrev"]')?.textContent?.trim();o&&n.push({playerName:o,teamName:c||'Unknown',pickNumber:e+1})}),0===n.length&&window.__NEXT_DATA__&&console.log('Trying to extract from __NEXT_DATA__...'),0===n.length){console.log('Trying alternative DOM selectors...');document.querySelectorAll('[data-testid*="pick"], .Pick, .draft-pick').forEach((t,e)=>{const o=t.textContent?.trim();o&&o.length>3&&o.length<100&&n.push({playerName:o,teamName:'Unknown',pickNumber:e+1})})}if(0===n.length)return alert('⚠️ Could not find any picks on this page. The page structure may have changed.\\n\\nTry:\\n1. Make sure the draft has started\\n2. Check the browser console (F12) for errors\\n3. Send a screenshot to help debug'),void console.error('No picks found. Page structure:',document.body.innerHTML.substring(0,500));console.log(\`Found \${n.length} picks, sending to tracker...\`),fetch(\`\${t}/api/draft-sync/\${e}\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({picks:n,teams:[],totalPicks:130,isComplete:!1,syncedAt:(new Date).toISOString()})}).then(t=>t.json()).then(t=>{t.success?alert(\`✅ Success! Synced \${t.pickCount} picks to your tracker.\\n\\nRefresh your tracker page to see updates.\`):alert('❌ Error: '+(t.error||'Unknown error'))}).catch(e=>{console.error('Sync error:',e),alert('❌ Failed to sync. Make sure your tracker is running at '+t)})})();`

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">ESPN Draft Sync Setup</h1>
        <p className="text-gray-400 mb-8">
          Since ESPN doesn't provide real-time API updates for mock drafts, use this bookmarklet to manually sync draft picks.
        </p>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Step 1: Add the Bookmarklet</h2>
          <p className="text-gray-400 mb-4">
            Drag this button to your bookmarks bar. When you click it, you'll be prompted to enter your tracker URL (e.g., http://localhost:3001 or whatever port your app is running on):
          </p>
          <div className="bg-gray-900 p-4 rounded border border-gray-700 mb-4">
            <a
              href={bookmarkletCode}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded inline-block cursor-move"
              onClick={(e) => {
                e.preventDefault()
                alert('Drag this button to your bookmarks bar (usually at the top of your browser)')
              }}
            >
              📊 Sync ESPN Draft
            </a>
          </div>
          <p className="text-sm text-gray-500">
            If you don't see your bookmarks bar, press <kbd className="bg-gray-700 px-2 py-1 rounded">Ctrl+Shift+B</kbd> (Windows) or <kbd className="bg-gray-700 px-2 py-1 rounded">Cmd+Shift+B</kbd> (Mac)
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Step 2: Use During Draft</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-400">
            <li>Open your ESPN draft page in one tab</li>
            <li>Open your draft tracker in another tab</li>
            <li>While on the ESPN draft page, click the "Sync ESPN Draft" bookmark</li>
            <li>You'll see a confirmation message</li>
            <li>Refresh your tracker tab to see the updated picks</li>
            <li>Click the bookmark again whenever you want to update</li>
          </ol>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Alternative: Manual Code</h2>
          <p className="text-gray-400 mb-4">
            If dragging doesn't work, create a new bookmark manually and paste this as the URL:
          </p>
          <div className="bg-gray-900 p-4 rounded border border-gray-700">
            <code className="text-xs text-green-400 break-all">
              {bookmarkletCode}
            </code>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(bookmarkletCode)
              alert('Copied to clipboard!')
            }}
            className="mt-4 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            📋 Copy Code
          </button>
        </div>

        <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-2 text-yellow-400">⚠️ Troubleshooting</h3>
          <ul className="list-disc list-inside space-y-1 text-yellow-200 text-sm">
            <li>Make sure you're on the ESPN draft page when clicking the bookmark</li>
            <li>Make sure your tracker is running (localhost:3000)</li>
            <li>Check browser console (F12) for error messages</li>
            <li>The bookmarklet only works while the draft page is open</li>
          </ul>
        </div>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
