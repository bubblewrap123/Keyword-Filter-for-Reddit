# Keyword-Filter-for-Reddit
Hide Reddit posts whose titles contain keywords you specify. Create multiple profiles to organize your filters. Works on both old and new Reddit.

## Features

- Filters on post titles only (post text and comments are never filtered)
- Whole-word matching, with `*` wildcards for partial matches
- Create multiple keyword profiles (e.g., "Politics", "Spoilers", "Sports")
- Enable/disable profiles individually
- Works on both old.reddit.com and new Reddit
- Import/export profiles
- Statistics tracking (posts filtered per session and total)
- Lightweight - only runs on Reddit pages

## How to Use

1. Click the extension icon on any Reddit page
2. Create a new profile
3. Add keywords you want to filter
4. Enable the profile

## How Keywords Match

Keywords match whole words in post titles and ignore upper/lower case.

| Keyword | Hides | Doesn't hide |
|---------|-------|--------------|
| `AI` | "New AI model", "AI's future" | "He said", "Rain in Spain" |
| `crypto*` | "crypto", "cryptocurrency" | "encrypted" |
| `*coin` | "bitcoin", "dogecoin" | "coins" |
| `*ai*` | anything containing "ai" (the old behavior) | |
| `climate change` | "Climate change report" | "climate is changing" |

A post you open directly is never hidden on its own page, even if its title matches.

## Privacy

All data is stored locally in your browser. This extension does not collect or transmit any data to external servers.

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| Storage | Save your keyword profiles locally |
| Access to reddit.com | Required to filter posts on Reddit |

