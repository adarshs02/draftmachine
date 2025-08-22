"""
fantasy_adp_scraper.py
=======================

This module contains helper functions to scrape Average Draft Position
(ADP) data for fantasy basketball players from a couple of popular
aggregation sites.  The goal of the scraper is to produce a table
showing each player's ADP on Yahoo, ESPN and Fantrax (where
available), along with an overall average.  It can be run as a script
from the command line to fetch the data and save it to a CSV file for
later analysis.

Two sources are supported:

* **Hashtag Basketball** – The `https://hashtagbasketball.com/fantasy-basketball-adp`
  page hosts a server‑rendered HTML table of ADP data.  Each row
  contains the player name, team and the ADP on Yahoo, ESPN,
  Fantrax and a blended average.  Because the content is rendered on
  the server, a simple HTTP request with a fake User‑Agent header is
  sufficient to retrieve the page without running any JavaScript.

* **FantasyPros** – The `https://www.fantasypros.com/nba/adp/overall.php`
  page contains ADP data aggregated from two sources (Yahoo and
  ESPN) along with an overall average.  The table is also rendered
  server‑side and can be parsed with BeautifulSoup or Pandas.

The main entry point of the script calls both scrapers, merges their
results and writes the combined dataset to a CSV file.  Each player
is keyed by name; if a player appears in both sources, the ADP
values from Hashtag Basketball take precedence because they include
Fantrax and may be updated more frequently.  You can customise this
behaviour by modifying the `merge_adp_data` function.

Usage (from a Python prompt or terminal):

    python fantasy_adp_scraper.py --output adp_data.csv

This will fetch the latest ADP information from both sites and write
it to `adp_data.csv`.  If no output file is specified the data is
printed to stdout.

Note:  Websites often update their HTML structure.  If you run into
parsing errors, check the markup with your browser's *view source*
function.  The scraper is intentionally written in a straightforward
style to make maintenance simple.
"""

from __future__ import annotations

import argparse
import csv
import logging
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional

import requests
from bs4 import BeautifulSoup


logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


@dataclass
class PlayerADP:
    """Container for a player's average draft position across multiple sites."""

    player: str
    team: str
    yahoo: Optional[float] = None
    espn: Optional[float] = None
    fantrax: Optional[float] = None
    average: Optional[float] = None

    @staticmethod
    def from_hashtag_row(cells: List[str]) -> "PlayerADP":
        """Create a PlayerADP instance from a row of HashtagBasketball data.

        The Hashtag Basketball table format is:

        [Player, Team, Yahoo, ESPN, Fantrax, Blend]

        Blank strings represent missing values.
        """
        player, team, yahoo_str, espn_str, fantrax_str, blend_str = cells

        def parse(cell: str) -> Optional[float]:
            return float(cell) if cell and cell.replace(".", "", 1).isdigit() else None

        return PlayerADP(
            player=player,
            team=team,
            yahoo=parse(yahoo_str),
            espn=parse(espn_str),
            fantrax=parse(fantrax_str),
            average=parse(blend_str),
        )

    @staticmethod
    def from_fantasypros_row(cells: List[str]) -> "PlayerADP":
        """Create a PlayerADP instance from a row of FantasyPros data.

        The FantasyPros table format is:

        [Rank, Player (team positions), Yahoo, ESPN, AVG]

        The Player cell includes the team abbreviation in parentheses and
        potentially multiple positions (e.g., "Nikola Jokic (DEN - C)").  We
        split the string on '(' to isolate the name and team.
        """
        rank, player_cell, yahoo_str, espn_str, avg_str = cells

        # Extract player name and team from the player cell.
        name_part = player_cell.strip()
        team = ""
        if "(" in name_part:
            name, meta = name_part.split("(", 1)
            team = meta.split("-", 1)[0].strip()  # e.g. "DEN" from "DEN - C)"
            name = name.strip()
        else:
            name = name_part

        def parse(cell: str) -> Optional[float]:
            return float(cell) if cell and cell.replace(".", "", 1).isdigit() else None

        return PlayerADP(
            player=name,
            team=team,
            yahoo=parse(yahoo_str),
            espn=parse(espn_str),
            average=parse(avg_str),
        )


def scrape_hashtag_adp(session: Optional[requests.Session] = None) -> List[PlayerADP]:
    """Scrape ADP data from HashtagBasketball.

    A simple HTTP GET request is used to download the page.  The response is
    parsed with BeautifulSoup, and the table rows are converted into
    ``PlayerADP`` objects.  Users sometimes encounter HTTP 403 errors when
    requesting this page without a User‑Agent header.  If that happens,
    initialise a ``requests.Session`` with custom headers and pass it to
    this function.

    :param session: Optional requests Session for custom headers or caching
    :return: A list of PlayerADP objects
    """
    url = "https://hashtagbasketball.com/fantasy-basketball-adp"
    s = session or requests.Session()
    # Faking a browser User-Agent improves the chance of a successful request
    s.headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/115.0 Safari/537.36",
    )

    logging.info("Fetching data from HashtagBasketball …")
    resp = s.get(url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "html.parser")

    table = soup.find("table", id="ContentPlaceHolder1_GridView1")
    if not table:
        raise RuntimeError(
            "Unable to locate the ADP table. The page structure may have changed."
        )

    players: List[PlayerADP] = []
    rows = table.find_all("tr")[1:]  # skip header row
    for row in rows:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        if not cells:
            continue
        try:
            player_adp = PlayerADP.from_hashtag_row(cells)
        except Exception as exc:
            logging.warning(f"Skipping row due to parsing error: {cells} ({exc})")
            continue
        players.append(player_adp)

    logging.info(f"Parsed {len(players)} players from HashtagBasketball.")
    return players


def scrape_fantasypros_adp(session: Optional[requests.Session] = None) -> List[PlayerADP]:
    """Scrape ADP data from FantasyPros.

    FantasyPros hosts a table that lists ADP on Yahoo and ESPN and an
    overall average.  This function downloads the page, parses the first
    HTML table found and converts each row into a ``PlayerADP`` instance.

    :param session: Optional requests Session for custom headers or caching
    :return: A list of PlayerADP objects
    """
    url = "https://www.fantasypros.com/nba/adp/overall.php"
    s = session or requests.Session()
    s.headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/115.0 Safari/537.36",
    )

    logging.info("Fetching data from FantasyPros …")
    resp = s.get(url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "html.parser")

    table = soup.find("table")
    if not table:
        raise RuntimeError(
            "Unable to locate the ADP table on FantasyPros. The page structure may have changed."
        )

    players: List[PlayerADP] = []
    rows = table.find_all("tr")
    # Identify the header and figure out which columns we need
    header = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
    # We expect the header to look like ['Rank', 'Player', 'Yahoo', 'ESPN', 'AVG']
    # Skip the header row when parsing players
    for row in rows[1:]:
        cells = [c.get_text(strip=True) for c in row.find_all(["td", "th"])]
        if not cells or len(cells) < 5:
            continue
        try:
            player_adp = PlayerADP.from_fantasypros_row(cells[:5])
        except Exception as exc:
            logging.warning(f"Skipping row due to parsing error: {cells} ({exc})")
            continue
        players.append(player_adp)

    logging.info(f"Parsed {len(players)} players from FantasyPros.")
    return players


def merge_adp_data(primary: List[PlayerADP], secondary: List[PlayerADP]) -> List[PlayerADP]:
    """Merge two lists of PlayerADP objects.

    Players from the primary list override entries from the secondary
    list.  If a player appears only in the secondary list, they are
    included.  Merging is based on the player name.

    :param primary: Preferred data source (e.g. HashtagBasketball)
    :param secondary: Fallback data source (e.g. FantasyPros)
    :return: A merged list of PlayerADP objects
    """
    merged: Dict[str, PlayerADP] = {p.player: p for p in secondary}
    for p in primary:
        merged[p.player] = p
    return list(merged.values())


def write_to_csv(players: List[PlayerADP], filepath: str) -> None:
    """Write ADP data to a CSV file.

    :param players: A list of PlayerADP objects
    :param filepath: Path to the CSV file to write
    """
    fieldnames = ["player", "team", "yahoo", "espn", "fantrax", "average"]
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for p in players:
            writer.writerow(asdict(p))
    logging.info(f"Wrote {len(players)} players to {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Scrape fantasy basketball ADP data.")
    parser.add_argument(
        "--output",
        "-o",
        metavar="FILE",
        default="",
        help="Write CSV output to FILE instead of printing to stdout.",
    )
    args = parser.parse_args()

    # Create a session with headers to reuse across requests
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        }
    )

    try:
        hashtag_data = scrape_hashtag_adp(session)
    except Exception as e:
        logging.error(f"Failed to scrape HashtagBasketball: {e}")
        hashtag_data = []

    try:
        fantasypros_data = scrape_fantasypros_adp(session)
    except Exception as e:
        logging.error(f"Failed to scrape FantasyPros: {e}")
        fantasypros_data = []

    combined = merge_adp_data(hashtag_data, fantasypros_data)

    # Sort alphabetically for readability
    combined.sort(key=lambda p: p.player)

    if args.output:
        write_to_csv(combined, args.output)
    else:
        # Print to stdout in a simple table
        print(
            f"{'Player':30} {'Team':5} {'Yahoo':>5} {'ESPN':>5} "
            f"{'Fantrax':>7} {'Avg':>6}"
        )
        for p in combined:
            print(
                f"{p.player:30} {p.team:5} "
                f"{(p.yahoo if p.yahoo is not None else '-'):>5} "
                f"{(p.espn if p.espn is not None else '-'):>5} "
                f"{(p.fantrax if p.fantrax is not None else '-'):>7} "
                f"{(p.average if p.average is not None else '-'):>6}"
            )


if __name__ == "__main__":
    main()