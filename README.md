# Munich Guide Bot

An archived Telegram scavenger-hunt bot for interactive inner-city tours in Munich.

This project was originally developed as a small practical bot project for exchange students in Munich. It guided participants through a scavenger hunt across the historical city center, combining navigation, short riddles, and background information about selected landmarks.

The repository is preserved here as a **portfolio artifact**. It showcases an early Node.js / Telegram bot project and documents the original idea and implementation.

---

## Project Status

This bot is **currently offline** and is **not maintained as an active production service**.

The original deployment depended on external infrastructure and credentials that are not part of this repository, including:

- a Telegram bot token
- a hosted webhook endpoint
- Google Sheets service-account credentials
- the original runtime environment used for deployment

As a result, this repository should be understood primarily as a **code showcase / archived artifact**, not as a ready-to-run public bot.

---

## What the Bot Did

The bot led users through **20 stations** in Munich's inner city.
At each station, the player received:

- a clue for the next location
- a small riddle or task
- additional background information about the current place

To advance, the player had to submit the correct answer. The bot also tracked progress, supported resuming interrupted games, and displayed a simple leaderboard.

---

## Features

- Telegram-based interactive city tour
- scavenger-hunt style progression through 20 stations
- persistent game state
- resume functionality for unfinished games
- leaderboard for completed runs
- penalty mechanism for repeated incorrect answers
- background information for each station

---

## Tech Stack

- **Node.js**
- **Telegraf** for Telegram bot interaction
- **Google Sheets** as a lightweight persistence layer
- **dotenv** for environment-based configuration

---

## Repository Contents

- `bot.js` — main Telegram bot implementation
- `envelopes.json` — clues, tasks, and station information
- `the_guide.png` — project image / visual asset
- `package.json` — project metadata and dependencies

---

## Commands

| Command | Description |
| --- | --- |
| `/help` | List available commands |
| `/newgame` | Start a new scavenger hunt |
| `/resumegame` | Resume an existing scavenger hunt |
| `/endgame` | End the current scavenger hunt |
| `/ladder` | Show the leaderboard |
| `/clue` | Repeat the most recent clue |
| `/showprogress` | Show current progress |
| `/info` | Show information about the current station |

---

## Notes on Reproducibility

This codebase reflects the original implementation and has intentionally been preserved in a mostly historical form.

It is therefore **not guaranteed to run out of the box** without recreating the original external setup. In particular, anyone attempting to run the bot would need to provide:

- a valid Telegram bot token
- a public webhook URL or an alternative local polling setup
- compatible Google Sheets credentials
- the expected spreadsheet structure used by the bot backend

---

## Why This Repository Exists

This repository is included in my portfolio as an example of an applied side project involving:

- event-oriented bot logic
- lightweight backend integration
- interactive user flows
- real-world deployment considerations

While the public bot is no longer active, the project remains a useful snapshot of an early practical software project.

---

## Author

**Luka Petrovic**  
Technical University of Munich

Contact: luka.petrovic@tum.de

<div align="center">
  <img src="the_guide.png" height="120" alt="Munich Guide Bot logo">
</div>
