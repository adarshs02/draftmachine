# How to Get ESPN Cookies for Private Leagues

Your league is **private**, which requires ESPN authentication cookies.

## Quick Steps

### Chrome / Edge / Brave

1. **Go to ESPN Fantasy Basketball** while logged in:
   - https://fantasy.espn.com/basketball/

2. **Open Developer Tools**:
   - Press `F12` or right-click → "Inspect"

3. **Go to Application Tab**:
   - Click "Application" in the top menu
   - Expand "Cookies" in left sidebar
   - Click on "https://fantasy.espn.com"

4. **Find Two Cookies**:
   - Look for `espn_s2` - Copy the entire Value (very long string)
   - Look for `SWID` - Copy the Value (format: `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}`)

5. **Add to `.env.local`**:
   ```
   ESPN_S2=your_very_long_espn_s2_cookie_value_here
   ESPN_SWID={YOUR-SWID-VALUE-HERE}
   ```

6. **Restart the dev server**:
   - Press `Ctrl+C` in terminal
   - Run `npm run dev` again

### Safari

1. Enable Developer Menu:
   - Safari → Settings → Advanced → Check "Show Develop menu"

2. Go to https://fantasy.espn.com/basketball/ while logged in

3. Develop → Show Web Inspector → Storage tab

4. Find cookies as above

### Firefox

1. Go to https://fantasy.espn.com/basketball/ while logged in

2. Press `F12` → Storage tab → Cookies → fantasy.espn.com

3. Find `espn_s2` and `SWID` cookies

4. Copy values to `.env.local`

## Example

Your `.env.local` should look like:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...

# ESPN Authentication
ESPN_S2=AEBa...very...long...string...here
ESPN_SWID={8398089B-19B2-4A9B-AD56-C97626BAD9B5}
```

## Important Notes

- **Keep these private!** These cookies give access to your ESPN account
- Cookies expire periodically (usually after a few weeks)
- If you get 401 errors again, your cookies expired - get new ones
- Don't commit `.env.local` to git (already in .gitignore)

## Alternative: Make League Public

If you don't want to use cookies, you can make your league public:

1. Go to ESPN Fantasy Basketball
2. League Settings → Basic Settings
3. Change "League Visibility" to "Public"
4. Save changes

Then the app will work without cookies.
