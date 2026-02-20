# Running Locally Without Docker

This guide provides step-by-step instructions for running the application directly in your local development environment without using Docker.

---

## 📋 Table of Contents

1. [Required Software Installation](#1-required-software-installation)
2. [Database Setup](#2-database-setup)
3. [Backend Setup and Execution](#3-backend-setup-and-execution)
4. [Webapp (Frontend) Setup and Execution](#4-webapp-frontend-setup-and-execution)
5. [Running the Complete Application](#5-running-the-complete-application)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Required Software Installation

### 1.1 PostgreSQL 13 Installation

**Windows Users:**

1. Visit https://www.postgresql.org/download/windows/
2. Download and install PostgreSQL version 13
3. During installation, set and remember a password
4. Keep the default port 5432

**macOS Users:**

```bash
brew install postgresql@13
brew services start postgresql@13
```

**Linux (Ubuntu) Users:**

```bash
sudo apt-get update
sudo apt-get install postgresql-13
sudo systemctl start postgresql
```

### 1.2 Redis Installation

**Windows Users:**

- If using WSL2:
  ```bash
  wsl
  sudo apt-get update
  sudo apt-get install redis-server
  redis-server
  ```
- Or native installation: https://github.com/microsoftarchive/redis/releases

**macOS Users:**

```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu) Users:**

```bash
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### 1.3 Node.js Installation

1. Visit https://nodejs.org/
2. Download and install the LTS version (v18 or higher)
3. Verify installation:

```bash
node --version
npm --version
```

### 1.4 Python Installation

1. Visit https://www.python.org/downloads/
2. Download and install Python 3.10
3. **Windows users: Make sure to check "Add Python to PATH"**
4. Verify installation:

```bash
python --version
pip --version
```

---

## 2. Database Setup

### 2.1 Create PostgreSQL Database and User

**Windows Users:**

1. Open "pgAdmin 4" from Windows Start Menu
2. Navigate to http://localhost:5050 in your browser
3. Log in to pgAdmin
4. Right-click "Servers" → "Register" → "Server"
5. Enter the following information:
   - Name: localhost
   - Host: localhost
   - Port: 5432
   - Username: postgres
   - Password: (password set during installation)

**macOS/Linux Users:**
Access PostgreSQL shell:

```bash
sudo -u postgres psql
```

**All OS Users - Create Database:**

Execute the following commands in pgAdmin or PostgreSQL shell:

```sql
CREATE USER prostatecancer_user WITH PASSWORD 'secure_password_123';
CREATE DATABASE prostatecancer_db OWNER prostatecancer_user;
GRANT ALL PRIVILEGES ON DATABASE prostatecancer_db TO prostatecancer_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO prostatecancer_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO prostatecancer_user;
```

### 2.2 Initialize Schema

From the project root directory, execute:

**Windows Users:**

```bash
psql -h localhost -U prostatecancer_user -d prostatecancer_db -f database_schema.sql
```

**macOS/Linux Users:**

```bash
psql -U prostatecancer_user -d prostatecancer_db -f database_schema.sql
```

Enter password: `secure_password_123`

### 2.3 Start Redis

**Windows (WSL2):**

```bash
wsl
redis-server
```

**macOS:**

```bash
redis-server
```

**Linux:**

```bash
redis-server
```

> Redis runs automatically on the default port 6379 without any configuration.

---

## 3. Backend Setup and Execution

### 3.1 Create Python Virtual Environment

Navigate to the `backend` directory:

```bash
cd backend
```

Create a virtual environment:

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

When the virtual environment is activated, you will see `(venv)` in your terminal.

### 3.2 Install Python Packages

With the virtual environment activated:

```bash
pip install --upgrade pip
pip install -r requirements.txt
pip install uvicorn[standard]
pip install gunicorn
```

If errors occur during installation, install packages individually:

```bash
pip install fastapi
pip install sqlalchemy
pip install asyncpg
pip install redis
# ... (install other packages from requirements.txt)
```

### 3.3 Set Environment Variables

Create a `.env` file in the backend directory:

**Windows: Using Notepad**

1. Right-click in the backend folder
2. Select "New" → "Text Document"
3. Rename the file to `.env`
4. Paste the content below

**macOS/Linux:**

```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql+asyncpg://prostatecancer_user:secure_password_123@localhost:5432/prostatecancer_db
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_TIMEOUT=30
DATABASE_POOL_RECYCLE=1800
DATABASE_POOL_USE_LIFO=true
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=["http://localhost:3000","http://localhost"]
PORT=8000
EOF
```

**.env File Content:**

```
DATABASE_URL=postgresql+asyncpg://prostatecancer_user:secure_password_123@localhost:5432/prostatecancer_db
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_POOL_TIMEOUT=30
DATABASE_POOL_RECYCLE=1800
DATABASE_POOL_USE_LIFO=true
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=["http://localhost:3000","http://localhost"]
PORT=8000
```

### 3.4 Run Backend

**Development Mode (Recommended - Auto-reload on code changes):**

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Production Mode:**

```bash
gunicorn -k uvicorn.workers.UvicornWorker main:app \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  --timeout 60
```

**Verify Execution:**

- Open http://localhost:8000/docs in your browser
- Check Swagger API documentation
- Access http://localhost:8000/health to verify status

> Keep the Backend running in the current terminal!

---

## 4. Webapp (Frontend) Setup and Execution

### 4.1 Open a New Terminal Window

> Open a **new terminal window** while the Backend is still running.

### 4.2 Navigate to Webapp Directory

```bash
cd ../Webapp
```

> Assumes that `backend` and `Webapp` are at the same directory level.

### 4.3 Install Node.js Dependencies

```bash
npm install
```

> This may take 2-5 minutes on the first run.

### 4.4 Set Environment Variables

Create a `.env.local` file in the Webapp directory:

**Windows: Using Notepad**

1. Right-click in the Webapp folder
2. Select "New" → "Text Document"
3. Rename the file to `.env.local`
4. Paste the content below

**macOS/Linux:**

```bash
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
```

**.env.local Content:**

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

### 4.5 Run Webapp

**Development Mode (Recommended):**

```bash
npm run dev
```

You should see the following message in the output:

```
> ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

**Production Mode (Build then run):**

```bash
npm run build
npm run start
```

Or run the Express server directly:

```bash
node server.js
```

**Verify Execution:**

- Open http://localhost:3000 in your browser
- Confirm the application displays correctly

> Keep the Webapp running in the current terminal!

---

## 5. Running the Complete Application

### 5.1 Service Startup Order

1. **Start PostgreSQL** (often starts automatically)
2. **Start Redis** (Terminal 1)
3. **Start Backend** (Terminal 2)
4. **Start Webapp** (Terminal 3)

### 5.2 Terminal Window Setup

You should have 3-4 terminal windows running:

```
Terminal 1: Redis Running
  $ redis-server

Terminal 2: Backend Running (backend directory)
  (venv) $ uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Terminal 3: Webapp Running (Webapp directory)
  $ npm run dev
```

### 5.3 Port Information

Services running on the following ports:

| Service           | Port | URL                   |
| ----------------- | ---- | --------------------- |
| PostgreSQL        | 5432 | localhost:5432        |
| Redis             | 6379 | localhost:6379        |
| Backend (API)     | 8000 | http://localhost:8000 |
| Webapp (Frontend) | 3000 | http://localhost:3000 |

### 5.4 Access the Application

Open your web browser and navigate to:

```
http://localhost:3000
```

---

## 6. Troubleshooting

### Problem: "Cannot connect to PostgreSQL"

**Solution:**

1. Verify PostgreSQL is running
2. Check that port 5432 is not occupied by another process
3. Verify the DATABASE_URL in the `.env` file
4. Confirm that the database and user were created correctly

```bash
psql -h localhost -U prostatecancer_user -d prostatecancer_db -c "SELECT 1"
```

### Problem: "Cannot connect to Redis"

**Solution:**

1. Verify Redis is running
2. Check that port 6379 is available
3. Start Redis:

```bash
redis-server
```

### Problem: "Port already in use" error

**Solution:**

**Windows:**

```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**macOS/Linux:**

```bash
lsof -i :8000
kill -9 <PID>
```

### Problem: "Python module not found"

**Solution:**

1. Verify the virtual environment is activated (should show `(venv)` in terminal)
2. Verify all packages are installed:

```bash
pip install -r requirements.txt
```

### Problem: "npm command not found"

**Solution:**

1. Verify Node.js is properly installed:

```bash
node --version
npm --version
```

2. If needed, reinstall Node.js:
   - Visit https://nodejs.org/
   - Download and install the latest LTS version

### Problem: CORS error from Backend

**Solution:**
Verify the CORS_ORIGINS in `.env`:

```
CORS_ORIGINS=["http://localhost:3000","http://localhost"]
```

### Problem: Database migration required

**Solution:**
From the backend directory:

```bash
# If using Alembic
alembic upgrade head

# Or use init_db.py script
python init_db.py
```

---

## 📝 Additional Tips

### Auto-reload During Development

The Backend already has the `--reload` flag configured to automatically reload on code changes.

The Webapp similarly auto-refreshes on code changes with `npm run dev`.

### Reset Database

To reset the database during development:

```bash
# Re-initialize PostgreSQL
psql -U prostatecancer_user -d prostatecancer_db -f database_schema.sql

# Or delete data only
psql -U prostatecancer_user -d prostatecancer_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

### View Logs

You can monitor real-time logs in each terminal:

- Backend: uvicorn logs
- Webapp: Next.js build and compilation logs
- Redis: Connection info and errors

---

## 🆘 Additional Support

If you encounter issues:

1. Check the logs from all services
2. Verify ports are configured correctly
3. Verify environment variables (`.env`, `.env.local`) are set correctly
4. Confirm all services are running

---
