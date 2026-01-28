# Database Schema

The application uses SQLite for local persistence.

## settings
Stores configuration values such as the active product catalog.

| Column | Type | Notes |
| --- | --- | --- |
| key | TEXT | Primary key |
| value | TEXT | JSON payload |

## sessions
Tracks each simulation session.

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT | Primary key, nanoid |
| mode | TEXT | `simple` or `installation` |
| scenario | TEXT | Scenario description |
| ideal_resolution | TEXT | Target outcome |
| scenario_context | TEXT | Customer goal |
| status | TEXT | `active` or `completed` |
| score | REAL | Final average score |
| analysis | TEXT | JSON evaluation blob |
| suggestions | TEXT | Coaching suggestions |
| created_at | TEXT | ISO timestamp |
| completed_at | TEXT | ISO timestamp |
| language | TEXT | Default `English` |

## messages
Stores conversation transcripts for each session.

| Column | Type | Notes |
| --- | --- | --- |
| id | INTEGER | Autoincrement |
| session_id | TEXT | FK to sessions.id |
| role | TEXT | `user` or `assistant` |
| content | TEXT | Transcript content |
| created_at | TEXT | ISO timestamp |
