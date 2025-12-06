#!/bin/bash

# Port Diagnostic Script for SARS-CoV-2 Dashboard
echo "🔍 Checking port usage for SARS-CoV-2 Dashboard..."
echo ""

# Check ports used by the application
PORTS=(5432 8000 5050)
PORT_NAMES=("PostgreSQL" "FastAPI Backend" "PgAdmin")

for i in "${!PORTS[@]}"; do
    PORT=${PORTS[$i]}
    NAME=${PORT_NAMES[$i]}
    
    echo "Checking port $PORT ($NAME):"
    
    # Check what's using the port
    if command -v lsof >/dev/null 2>&1; then
        # macOS/Linux with lsof
        RESULT=$(lsof -i :$PORT 2>/dev/null)
        if [ -n "$RESULT" ]; then
            echo "❌ Port $PORT is in use:"
            echo "$RESULT"
        else
            echo "✅ Port $PORT is available"
        fi
    elif command -v netstat >/dev/null 2>&1; then
        # Linux/Windows with netstat
        RESULT=$(netstat -tulpn 2>/dev/null | grep :$PORT)
        if [ -n "$RESULT" ]; then
            echo "❌ Port $PORT is in use:"
            echo "$RESULT"
        else
            echo "✅ Port $PORT is available"
        fi
    else
        echo "⚠️  Cannot check port $PORT (no lsof or netstat available)"
    fi
    echo ""
done

# Check for existing Docker containers
echo "🐳 Checking Docker containers:"
if command -v docker >/dev/null 2>&1; then
    echo "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
    echo ""
    
    echo "PostgreSQL containers (running and stopped):"
    docker ps -a --filter ancestor=postgres --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
else
    echo "Docker not available"
fi
echo ""

# Check for local PostgreSQL service
echo "🗄️  Checking local PostgreSQL service:"
if command -v brew >/dev/null 2>&1; then
    # macOS with Homebrew
    if brew services list | grep postgresql >/dev/null 2>&1; then
        echo "Homebrew PostgreSQL services:"
        brew services list | grep postgresql
    else
        echo "No Homebrew PostgreSQL services found"
    fi
elif command -v systemctl >/dev/null 2>&1; then
    # Linux with systemd
    if systemctl is-active postgresql >/dev/null 2>&1; then
        echo "SystemD PostgreSQL status:"
        systemctl status postgresql --no-pager -l
    else
        echo "No active PostgreSQL systemd service"
    fi
elif command -v service >/dev/null 2>&1; then
    # Linux with service
    if service postgresql status >/dev/null 2>&1; then
        echo "PostgreSQL service status:"
        service postgresql status
    else
        echo "No active PostgreSQL service"
    fi
else
    echo "Cannot check PostgreSQL service status"
fi