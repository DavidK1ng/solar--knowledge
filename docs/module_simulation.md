# Module: Simulation & Coaching

## Responsibilities
- Generate training scenarios based on product catalog data.
- Simulate the customer persona during the conversation.
- Produce a final evaluation with scores and coaching suggestions.

## APIs
### POST /api/sessions
Creates a new simulation.

**Request**
```json
{ "mode": "simple", "language": "English" }
```

**Response**
```json
{
  "sessionId": "...",
  "scenario": {
    "scenario_description": "...",
    "customer_goal": "...",
    "ideal_resolution": "...",
    "customer_profile": "...",
    "constraints": "...",
    "preselected_products": "...",
    "payment_status": "...",
    "tone": "..."
  }
}
```

### POST /api/sessions/:id/message
Adds a user message and returns the simulated customer response.

**Response**
```json
{
  "reply": "...",
  "audioUrl": "/audio/...mp3"
}
```

### POST /api/sessions/:id/complete
Evaluates the session and returns score/feedback.

## Scoring Logic
- Each category is scored 1-5 by the LLM evaluator.
- Final score is the rounded average of the category scores to one decimal.

## Extension Points
- Add new scenario types by extending the prompt in `generateScenario()`.
- Add new evaluation categories by updating `evaluationPrompt` and the frontend display.
- Introduce new languages by adding a language selector in the UI and passing it to the backend.
