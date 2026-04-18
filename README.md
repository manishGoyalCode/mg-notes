# TaskTracker

A personal task and notes manager with a kanban board, daily logs, CPT report generation, and a rich notes editor — all in a clean, keyboard-friendly UI.

## Features

- **Board view** — drag-and-drop kanban with Todo / Doing / Done columns
- **Today view** — see what's in progress and log daily updates
- **History** — browse completed tasks and logs by day
- **CPT Report** — generate performance review summaries with one click
- **Notes** — rich editor with slash commands, markdown shortcuts, and live preview
- **Projects & Tags** — organize and filter tasks
- **Keyboard shortcuts** — `n` new task, `1-5` switch views, `/` search, `e` edit
- **Dark / Light theme** toggle

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no framework)
- **Backend**: Node.js + Express
- **Database**: SQLite via `better-sqlite3`

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later

### Install & Run

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd NotesApp

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The app will be running at **http://localhost:3000**.

On first launch, the app seeds sample data so you can explore right away.

### Custom Port

```bash
PORT=8080 npm start
```

### Docker (standalone)

```bash
# Build the image
docker build -t tasktracker .

# Run the container (data persists in a named volume)
docker run -d -p 3000:3000 -v tasktracker-data:/app/data --name tasktracker tasktracker
```

### Docker Compose + Nginx (recommended for deploy)

```bash
docker compose up -d
```

This starts two containers:
- **Nginx** on port **80** — reverse proxy with gzip and static file caching
- **Node app** on internal port 3000

Visit **http://localhost** (port 80). SQLite data persists via a named Docker volume.

```bash
# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

## Project Structure

```
NotesApp/
├── index.html            # Main HTML shell
├── styles.css            # All styles (dark/light themes)
├── app.js                # Frontend logic (rendering, events, state)
├── package.json          # Dependencies & scripts
├── Dockerfile            # Container image for the Node app
├── docker-compose.yml    # Orchestrates Node app + Nginx
├── .gitignore
├── .dockerignore
├── server/
│   ├── index.js          # Express server (static files + API)
│   └── db.js             # SQLite read/write layer
├── nginx/
│   └── nginx.conf        # Reverse proxy config
└── data/                 # Created at runtime (gitignored)
    └── tasktracker.db    # SQLite database
```

## API

The backend exposes two endpoints:

| Method | Endpoint | Description |
|--------|------------|-------------------------------|
| `GET`  | `/api/state` | Returns the full app state JSON |
| `PUT`  | `/api/state` | Saves the full app state JSON |

The frontend also keeps **localStorage** as a backup — if the server is unreachable, the app still works offline.
