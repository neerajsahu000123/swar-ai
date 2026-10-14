# SWAR_AI

Marathi-first citizen-services assistant for Maharashtra, with Hindi and English support. The project has a browser interface and a FastAPI backend. Run both through FastAPI so the website and API share one address.

## What you need

- Windows 10/11 for the local steps below
- Python 3.11 or newer installed and available as python in PowerShell
- A valid Gemini API key with access to the configured text and audio models
- Internet access for Gemini requests and live source retrieval

Do not put API keys in app.js, index.html, or any other browser file. Keep them in BACKEND/.env locally or in your hosting provider's secret/environment-variable settings. The .env file is ignored by Git.

## Run locally (Windows PowerShell)

Open **PowerShell** (not Command Prompt) and run:

    cd C:\Users\hp\Desktop\SWAR_AI\BACKEND

    # Create the virtual environment only if it does not already exist.
    if (!(Test-Path .venv\Scripts\python.exe)) { python -m venv .venv }

    # Install or refresh the backend dependencies.
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt

    # Create .env only on first setup, so an existing key is not overwritten.
    if (!(Test-Path .env)) { Copy-Item .env.example .env }

    # Open .env and add your Gemini API key.
    notepad .env

    # Start the development server.
    .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --log-level info

In BACKEND/.env, set GEMINI_API_KEY to your own key. Save the file and restart the server after changing settings. The included .venv is specific to this computer; do not copy it to another machine or upload it to hosting.

Open the app at http://127.0.0.1:8000. API health is at http://127.0.0.1:8000/api/health, and interactive API docs are at http://127.0.0.1:8000/docs. Stop the server with **Ctrl+C** in its PowerShell window.

The --reload option is for local development. It restarts the backend when Python files change. Keep that terminal window open while using the app.

### If you use Command Prompt (CMD)

The PowerShell-only Copy-Item command will not work in CMD. Use CMD's copy command instead:

    cd /d C:\Users\hp\Desktop\SWAR_AI\BACKEND
    if not exist .env copy .env.example .env
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    notepad .env
    .\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --log-level info

If python is not recognized or the virtual environment does not exist, install Python 3.11 or newer, reopen PowerShell, and run the setup commands again. This project does not require the separate uvicorn command to be on PATH; invoking it through the virtual environment's Python avoids that issue.

## Configuration

The example settings in .env.example are:

| Variable | Purpose |
| --- | --- |
| GEMINI_API_KEY | Required Gemini API key. |
| GEMINI_MODEL | Text-answer model. The example selects gemini-3.5-flash-lite; if omitted, the code fallback is gemini-3.1-flash-lite. Use a model enabled for your Google AI Studio project. |
| GEMINI_SEARCH_GROUNDING | Optional Google Search grounding; defaults to false. Grounding has its own availability/quota. |
| GEMINI_AUDIO_MODEL | Gemini Live/Native Audio model used by voice features. |
| GEMINI_AUDIO_VOICE | Gemini prebuilt voice; the example uses Achernar. |
| CORS_ORIGINS | Allowed browser origins for API requests. The local defaults are included in the example. |

Model availability, quotas, and charges depend on the Google AI Studio project. Check them there if requests return errors such as 403, 404, or 429. Never paste a real key into source code, screenshots, chat, or a public repository. Any credential previously shared publicly or in a chat should be revoked and replaced.

## Deploy on Render

Use one Render **Web Service** for both the website and API. The frontend files (index.html, app.js, and styles.css) are in the repository root, while the Python app is in BACKEND. Connect the complete SWAR_AI repository to Render; do not deploy only the BACKEND folder.

1. Push the complete project to a Git repository that Render can access. Do not commit BACKEND/.env, BACKEND/.venv, or API keys.
2. In the Render Dashboard, create a **New + → Web Service** and connect that repository.
3. Configure the service:

   - **Language:** Python 3
   - **Branch:** the branch containing this project, commonly main
   - **Root Directory:** leave blank (repository root). This lets the app read the frontend files one directory above BACKEND and deploy when those files change.
   - **Build Command:** python -m pip install -r BACKEND/requirements.txt
   - **Start Command:** cd BACKEND && python -m uvicorn main:app --host 0.0.0.0 --port $PORT
   - **Health Check Path, if available:** /api/health

4. In the Render service's **Environment** settings, add GEMINI_API_KEY as a secret. Add these other entries individually if you want to match the local example:

       GEMINI_MODEL=gemini-3.5-flash-lite
       GEMINI_SEARCH_GROUNDING=false
       GEMINI_AUDIO_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
       GEMINI_AUDIO_VOICE=Achernar

   Do not upload the local .env file or paste keys into source code. Same-origin hosting does not need CORS_ORIGINS to include the Render URL.
5. Create the service and wait for the deploy to finish. Open the HTTPS onrender.com URL Render gives you. Check /api/health if the page or API does not work.

Render requires web services to bind to 0.0.0.0 and the port in PORT. Do not use --reload in production. HTTPS is needed for browser microphone access. The website and API use the same Render origin, so the local CORS list does not need the Render URL for this one-service setup. A separate frontend host also needs its exact origin in CORS_ORIGINS and an API base URL change in the frontend.

This prototype stores chat history in the user's browser localStorage; it does not include accounts, a shared chat database, or server-side chat backup. Its knowledge catalogue is the file BACKEND/data/knowledge_base.json. Review and maintain that catalogue and verify official sources before relying on answers in production. Gemini and source websites also need outbound internet access.

## What the backend does

- POST /api/chat — text answer, with approved local records and retrieved source material.
- POST /api/voice/answer — voice answer with text and audio.
- POST /api/voice/synthesize — synthesize speech.
- GET /api/health — reports service and configuration status without exposing API keys.
- GET /docs — interactive API documentation.

The backend prints API inputs, selected answer route, and outputs in its terminal logs for debugging. It avoids logging API credentials and omits encoded audio from the logs. Treat user questions in logs as potentially sensitive; choose hosting log retention/access accordingly.

## Knowledge catalogue

Edit BACKEND/data/knowledge_base.json to maintain the prototype catalogue. Seed records start as draft; the assistant uses records only after they have been checked against an official page, given a verification date, and marked approved. The catalogue is not comprehensive or continuously verified. Confirm current eligibility, document requirements, fees, and application steps against official sources.
