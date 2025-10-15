# Fantasy Basketball Auction Value Scraper

This tool scrapes auction dollar values for fantasy basketball players from multiple sources and provides a consolidated view across different platforms.

## Features

- **Yahoo Auction Values**: Scraped from Hashtag Basketball
- **ESPN Auction Values**: Scraped from Hashtag Basketball  
- **Average Values**: Overall consensus auction value across platforms

## Usage

### Basic Usage

Run the scraper and save to CSV:

```bash
python fantasy_auction_scraper.py --output auction_data.csv
```

### Display to Console

View auction values in the terminal:

```bash
python fantasy_auction_scraper.py
```

## Output Format

The script generates a CSV file with the following columns:

- `player`: Player name
- `team`: Current NBA team
- `yahoo`: Yahoo auction value ($)
- `espn`: ESPN auction value ($)
- `average`: Overall average auction value ($)

## Example Output

```
player,team,yahoo,espn,average
Nikola Jokic,DEN,87.4,75.6,81.5
Shai Gilgeous-Alexander,OKC,79.8,68.1,74.0
Victor Wembanyama,SA,81.9,68.6,75.3
Luka Doncic,LAL,72.8,66.4,69.6
```

## Data Sources

- **Primary Source**: [Hashtag Basketball](https://hashtagbasketball.com/fantasy-basketball-auction-values)

## Requirements

```
requests
beautifulsoup4
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Automated Updates

The repository includes a GitHub Actions workflow that automatically runs the scraper **every 2 hours**.

The workflow:
1. Runs the auction value scraper
2. Commits changes to a `bot/auction-update` branch
3. Creates/updates a pull request with the latest data

You can also trigger the workflow manually via the "Actions" tab in GitHub.

## Notes

- The script currently scrapes ~30 top players from Hashtag Basketball
- Data is sorted alphabetically by player name
- The script includes error handling for network issues and parsing failures
