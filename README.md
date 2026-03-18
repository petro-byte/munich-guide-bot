# Munich Guide Bot

Interactive Telegram scavenger-hunt bot guiding users through Munich’s historical city center.

**Telegram Bot:**  t.me/munichguidebot

## Project Background

This project was originally developed as a small practical bot project for exchange students in Munich. It guided participants through a scavenger hunt across the historical city center, combining navigation, short riddles, and background information about selected landmarks.

The goal was to create a fun and interactive way for exchange students to explore the city through a structured scavenger hunt combining:

- navigation
- small riddles
- historical context

The bot has since been **restored and redeployed** as a working demo.

## Features

- Telegram-based interactive city tour
- scavenger-hunt style progression through 20 stations
- persistent game state via Google Sheets
- resume functionality for unfinished games
- leaderboard for completed runs
- background information for each station
- penalty system for incorrect answers
- contextual background information

## Tech Stack

- Node.js
- Telegraf (Telegram Bot API)
- Google Sheets (data persistence)
- dotenv

## Repository Contents

- `bot.js` — main Telegram bot implementation
- `env.example` — example environment file
- `envelopes.json` — clues, tasks, and station information
- `package.json` — project metadata and dependencies

## Commands

| Command | Description |
|--------|------------|
| `/help` | List available commands |
| `/newgame` | Start a new scavenger hunt |
| `/resumegame` | Resume a saved game |
| `/endgame` | End the current game |
| `/ladder` | Show leaderboard |
| `/clue` | Repeat current clue |
| `/showprogress` | Show progress |
| `/info` | Show station info |

## Deployment Notes

This bot is deployed on a **free-tier hosting platform (e.g. Render)**.

Because of that:
- the service may **go to sleep when inactive**
- first response after inactivity may take **~30–60 seconds**

## Required Environment Variables

See `.env.example`

## Why This Project Exists

This repository serves as a portfolio project demonstrating:

- event-driven bot architecture
- external API integration
- lightweight backend design
- real-world deployment considerations

## Author

Luka Petrovic
