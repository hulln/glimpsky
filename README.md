
# GlimpSky - Bluesky Profile Viewer

A lightweight web tool for exploring public Bluesky accounts: posts, likes, followers and related data from public AT Protocol endpoints.

Vibecoded with ChatGPT and Claude.

## Why this exists

I wanted a simple way to:
- show only real posts (without reposts, quotes, or replies when needed),
- search posts with regex,
- search who a user replies to, and whose posts they like.

Most existing tools didn’t cover these needs well, so this fills that gap.

## Features

- View posts and likes for any public account
- Hide reposts, replies or quotes
- Filter by date range and text
- Regex search across post text
- Author search across post authors, reply targets and quoted authors
- Oldest-first ordering (with full load)
- Account info (joined date, last active, last follow)
- Quick profile stats, followers/following, mutuals, blocking

## Run locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Data sources

All data is fetched from public Bluesky APIs and AT Protocol PDS endpoints. Inspired by [Clearsky](https://github.com/ClearskyApp06/clearskyservices) (blocking features) and [Bluesky Likes by luizzeroxis](https://github.com/luizzeroxis/bluesky-likes/) (likes display).
