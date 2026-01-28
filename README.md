# Solar Voice Trainer

A web-only voice simulation app for solar storage retail training. The backend uses the OpenAI API for scenario generation, transcription, simulated customer responses, and TTS audio.

## Prerequisites
- Node.js 18+ (recommended)
- An OpenAI API key

## Local Run
1. Install dependencies:

```bash
npm install
```

2. Set your API key (example for bash/zsh):

```bash
export OPENAI_API_KEY="your_key_here"
```

3. Start the server:

```bash
npm run dev
```

4. Open the app in your browser:

```
http://localhost:3000
```

## First-time setup
- Upload a products JSON file via the UI, or click **Load sample data** to use the bundled sample list.
- Choose a scenario type and click **Start new session**.
- Use the microphone button or the text field to respond.
- Click **End & Evaluate** to finish and view the coaching feedback.

## Environment Variables
- `OPENAI_API_KEY` (required): API key used for scenario generation, transcription, and TTS.
- `PORT` (optional): Defaults to `3000`.

## Data Storage
- SQLite database: `data/app.db`
- Audio files: `data/audio/`
- Uploads: `data/uploads/`
