# Architecture

## Overview
The Solar Voice Trainer is a single web application with a Node.js backend and a browser-based front end. It uses the OpenAI API for transcription, scenario generation, simulated customer responses, and spoken audio output.

```
Browser (HTML/CSS/JS)
  |  - records audio (MediaRecorder)
  |  - renders transcript
  |  - plays TTS audio
  |  - drives session lifecycle
  v
Express API (Node.js)
  |  - uploads product JSON
  |  - generates scenario with OpenAI
  |  - handles chat + speech synthesis
  |  - stores session history (SQLite)
  v
SQLite (better-sqlite3)
```

## Components
- **Frontend (public/)**
  - Voice capture and playback UI.
  - Session controls: start, end, evaluation summary.
  - Product upload panel.
  - History and performance summary.

- **Backend (server.js)**
  - Scenario generation using product catalog.
  - Conversation simulation with context memory.
  - Speech-to-text (transcription).
  - Text-to-speech (audio response).
  - Evaluation scoring, session analytics.

- **Persistence (SQLite)**
  - Sessions, messages, evaluations stored locally.
  - Products stored in settings table + data/products.json for backup.

## Key Flows
1. **Product Upload**
   - User uploads a JSON file to `/api/products`.
   - Server stores it and uses it as catalog context.

2. **Start Session**
   - Client calls `/api/sessions` with type.
   - Server uses OpenAI to build a scenario and stores session state.

3. **Voice Exchange**
   - Client records audio → `/api/audio/transcribe`.
   - Transcript sent to `/api/sessions/:id/message`.
   - Server generates customer response and returns TTS audio URL.

4. **Completion & Evaluation**
   - Client calls `/api/sessions/:id/complete`.
   - Server produces evaluation scores and summary.

## Extensibility
- Add more scenario types by extending the prompt and mode list.
- Add additional languages by replacing the language parameter and UI selector.
- Swap storage to a hosted database by replacing the SQLite access layer.
