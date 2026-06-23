# BigQuery Release Notes Tracker

A sleek, responsive Flask web application designed to track, filter, categorize, and compile Google BigQuery release notes. It parses the official Atom feed, caches it locally for speed and offline availability, and provides a modern dashboard to search, filter, and draft updates (such as compiled summaries for Twitter/X).

---

## Features

- **Automated RSS Feed Parsing**: Fetches the official Google BigQuery release notes Atom feed and splits individual feed entries into structured, discrete updates (e.g., separating features, announcements, and issues).
- **Smart Local Caching**: Saves feed content in a local cache file (`release_notes_cache.xml`) to speed up loading and act as a failover if Google's documentation servers are unreachable.
- **Dynamic Frontend Dashboard**:
  - **Keyword Search**: Quick lookup across all release notes.
  - **Category Chips**: Filter notes dynamically by category (e.g., *Feature*, *Announcement*, *Breaking*, *Issue*, *Change*, *Deprecated*).
  - **Interactive Analytics**: Visual metrics counters showing the distribution of updates.
- **Drafting & Compilation tool**: Allows multi-selection of release items to compile them together into a summary format (like a draft Tweet).

---

## File Structure

```text
agy-cli-projects/
├── app.py                      # Main Flask application (feed fetcher, parser, and API routes)
├── requirements.txt            # Python dependencies (Flask)
├── release_notes_cache.xml     # Local feed cache (created at runtime, ignored by Git)
├── .gitignore                  # Git ignore rules for Python, IDEs, and local cache
├── templates/
│   └── index.html              # Main dashboard frontend template
└── static/
    ├── css/
    │   └── styles.css          # Styling (custom CSS, Outfit & Fira Code typography, dark theme elements)
    └── js/
        └── app.js              # Client-side search, selection, and rendering logic
```

- **[app.py](file:///A:/agy-cli-projects/app.py)**: Serves the web endpoints, manages fetching, parsing, and caching.
- **[requirements.txt](file:///A:/agy-cli-projects/requirements.txt)**: Minimal requirements list containing the `Flask` package.
- **[.gitignore](file:///A:/agy-cli-projects/.gitignore)**: Clean Git configuration file ensuring virtual environments, IDE metadata, and temporary cache files are not checked in.
- **[templates/index.html](file:///A:/agy-cli-projects/templates/index.html)**: Clean HTML layout containing search controls, filters, interactive stats cards, and selection controls.
- **[static/css/styles.css](file:///A:/agy-cli-projects/static/css/styles.css)**: Custom premium styling implementing Outfit fonts, CSS Grid, cards, custom color coding for categories, and sleek hover effects.
- **[static/js/app.js](file:///A:/agy-cli-projects/static/js/app.js)**: Frontend logic that fetches JSON from the `/api/releases` endpoint, updates the UI cards and metrics, processes text searching, and manages the multi-select Twitter compilation utility.

---

## Prerequisites

- **Python 3.8 or higher**
- **pip** (Python Package Installer)

---

## Configuration

All core configurations are managed at the top of **[app.py](file:///A:/agy-cli-projects/app.py)**:

- `FEED_URL`: The official XML feed url (default: `https://docs.cloud.google.com/feeds/bigquery-release-notes.xml`).
- `CACHE_FILE`: Name of the cache XML file (default: `release_notes_cache.xml`).
- **Server parameters**: You can modify the host and port in the `if __name__ == "__main__":` block (default: `host="127.0.0.1"`, `port=5000`).

---

## Setup & Running the App

Follow these steps to run the application locally:

### 1. Set Up a Virtual Environment (Recommended)

Navigate to the project root directory and create a virtual environment to isolate dependencies:

```bash
# Create the virtual environment
python -m venv .venv

# Activate it (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate it (Windows Command Prompt)
.venv\Scripts\activate.bat

# Activate it (macOS/Linux)
source .venv/bin/activate
```

### 2. Install Dependencies

Install Flask and any associated dependencies using `pip`:

```bash
pip install -r requirements.txt
```

### 3. Run the Application

Launch the Flask development server:

```bash
python app.py
```

By default, the server runs in debug mode on **`http://127.0.0.1:5000`**. Open this URL in your web browser to access the dashboard.

---

## API Endpoints

The backend provides the following routes:

### 1. Dashboard View
- **Path**: `GET /`
- **Description**: Renders the dynamic frontend panel `index.html`.

### 2. Release Notes API
- **Path**: `GET /api/releases`
- **Query Parameters**:
  - `refresh=true` (optional): Force-refreshes the local XML cache by downloading a fresh copy of the RSS feed from Google's servers.
- **Success Response Structure (JSON)**:
  ```json
  {
    "status": "success",
    "count": 10,
    "data": [
      {
        "id": "note_0_0",
        "date": "June 22, 2026",
        "updated_timestamp": "2026-06-22T12:00:00Z",
        "link": "https://cloud.google.com/bigquery/docs/release-notes#June_22_2026",
        "type": "Feature",
        "html": "...",
        "text": "..."
      }
    ]
  }
  ```
