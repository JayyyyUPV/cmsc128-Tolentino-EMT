To-Do List (Lab1 + Lab2)

- Backend: Flask (Python) + SQLite
- Databases: `accounts.db` (users), `tasks.db` (tasks, lists, memberships)
- Frontend: Vanilla HTML/CSS/JS

How To Run

- Optional venv (Windows): `python -m venv .venv && .\.venv\Scripts\activate`
- Install: `pip install flask flask-cors werkzeug`
- Start server: `python app.py`
- Open: http://127.0.0.1:5000

Auth Flow

- Visit `/auth` to Sign Up or Login
- Successful login redirects to `/` (To-Do page)
- Session persists across refresh until logout

API (JSON, requires login)

- `GET /tasks` — Personal tasks (no list_id)
- `GET /tasks?list_id=<id>` — Tasks for a collaborative list you belong to
- `POST /tasks` — `{ title, description?, dueDate?, dueTime?, priority?, list_id? }`
- `PATCH /tasks/<id>` — Update any of `{ title, description, dueDate, dueTime, priority, done }`
- `DELETE /tasks/<id>` — Delete permitted task
- `GET /lists` — Lists you belong to; returns `{ id, name, owner_id, is_collab, is_owner }`
- `POST /lists` — Create a collaborative list; `{ name }`
- `POST /lists/<id>/members` — Owner adds user by username; `{ username }`

Data Model Notes

- Personal: `tasks(user_id=<you>, list_id=NULL)`
- Collaborative: `tasks(list_id=<list>, user_id=<creator>)`
- Access via `list_members(list_id, user_id)`

