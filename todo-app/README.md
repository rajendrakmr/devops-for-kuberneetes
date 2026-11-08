# Todo App (FastAPI + Next.js + MySQL)

A small practice project. Add, complete and delete todos.

```
Browser -> Next.js (:3000) -> /api/* proxy -> FastAPI (:8000) -> MySQL (:3306)
```

## Run everything with Docker

```bash
docker compose up --build
```

| What | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API docs (Swagger) | http://localhost:8000/docs |
| MySQL (from host) | `127.0.0.1:3307`, user `todo`, password `todopass`, db `tododb` |

Stop: `docker compose down` (add `-v` to also delete the database volume).

## API

| Method | Path | Body | Meaning |
| --- | --- | --- | --- |
| GET | `/health` | | Health check |
| GET | `/todos` | | List todos (newest first) |
| POST | `/todos` | `{"title": "Buy milk"}` | Create a todo |
| PUT | `/todos/{id}` | `{"completed": true}` and/or `{"title": "..."}` | Update a todo |
| DELETE | `/todos/{id}` | | Delete a todo |

```bash
curl -X POST localhost:8000/todos -H "Content-Type: application/json" -d '{"title":"Learn Kubernetes"}'
curl localhost:8000/todos
```

## Run without Docker (for development)

**1. MySQL** (only the database in Docker):

```bash
docker compose up db
```

**2. Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DB_HOST=127.0.0.1 DB_PORT=3307 uvicorn app.main:app --reload --port 8000
```

**3. Frontend**

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

Open http://localhost:3000.

## Project layout

```
todo-app/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py       # routes (CRUD)
│       ├── database.py   # engine, session, wait for DB
│       ├── models.py     # SQLAlchemy table
│       └── schemas.py    # Pydantic request/response models
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── app/
        ├── page.js                  # todo UI
        ├── layout.js
        ├── globals.css
        └── api/[...path]/route.js   # proxy to the backend
```

## Settings (environment variables)

| Service | Variable | Default | Meaning |
| --- | --- | --- | --- |
| backend | `DB_HOST` | `localhost` | MySQL host |
| backend | `DB_PORT` | `3306` | MySQL port |
| backend | `DB_USER` / `DB_PASSWORD` | `todo` / `todopass` | Credentials |
| backend | `DB_NAME` | `tododb` | Database name |
| frontend | `BACKEND_URL` | `http://backend:8000` | Where the proxy sends `/api/*` (read at runtime) |

## Practice ideas

- Build the images and run them on your kind cluster (`kind load docker-image ...`).
- Write Deployments and Services for `mysql`, `backend`, `frontend`. Put DB credentials in a Secret and use a PersistentVolumeClaim for MySQL.
- Expose the frontend through your Envoy Gateway with an HTTPRoute. Set `BACKEND_URL` to the backend Service name.
- Add an HPA on the backend.
- Add features: edit a todo, due dates, filters, user login.
