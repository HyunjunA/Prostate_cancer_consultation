#!/bin/bash

# SARS-CoV-2 Dashboard Docker Startup Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_status "Docker is running"
}

# Function to check if docker-compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        print_error "docker-compose is not installed. Please install docker-compose and try again."
        exit 1
    fi
    print_status "docker-compose is available"
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    mkdir -p logs uploads data static
    print_status "Directories created"
}

# Function to check if CSV file exists
check_csv_file() {
    if [ ! -f "Processed_Data_DB.csv" ]; then
        print_warning "CSV file 'Processed_Data_DB.csv' not found"
        print_warning "The application will start without initial data"
        print_warning "You can upload data later via the API"
    else
        print_status "CSV file found"
    fi
}

# Function to start services
start_services() {
    print_status "Starting SARS-CoV-2 Dashboard services..."
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    docker-compose pull
    
    # Build and start services
    print_status "Building and starting services..."
    docker-compose up --build -d
    
    print_status "Services are starting up..."
    sleep 10
    
    # Check service health
    check_services_health
}

# Function to check service health
check_services_health() {
    print_status "Checking service health..."
    
    # Check PostgreSQL
    if docker-compose exec -T postgres pg_isready -U sarscov_user -d sarscov_db > /dev/null 2>&1; then
        print_status "✅ PostgreSQL is healthy"
    else
        print_error "❌ PostgreSQL is not responding"
    fi
    
    # Check Backend API
    sleep 5
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        print_status "✅ Backend API is healthy"
    else
        print_warning "⚠️  Backend API might still be starting up"
        print_status "You can check the status at: http://localhost:8000/health"
    fi
}

# Function to show service URLs
show_service_urls() {
    echo ""
    print_status "🚀 SARS-CoV-2 Dashboard is now running!"
    echo ""
    echo "Service URLs:"
    echo "  📊 API Documentation: http://localhost:8000/docs"
    echo "  🔗 API Health Check:  http://localhost:8000/health"
    echo "  🗄️  PgAdmin:          http://localhost:5050"
    echo ""
    echo "Database Access:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: sarscov_db"
    echo "  Username: sarscov_user"
    echo ""
    echo "PgAdmin Credentials:"
    echo "  Email: admin@sarscov.com"
    echo "  Password: admin123"
    echo ""
}

# Function to show logs
show_logs() {
    print_status "Showing service logs (Press Ctrl+C to exit)..."
    docker-compose logs -f
}

# Function to stop services
stop_services() {
    print_status "Stopping SARS-CoV-2 Dashboard services..."
    docker-compose down
    print_status "Services stopped"
}

# Function to restart services
restart_services() {
    print_status "Restarting services..."
    docker-compose restart
    print_status "Services restarted"
}

# Function to clean up
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker-compose down -v
    docker system prune -f
    print_status "Cleanup completed"
}

# Main script logic
case "${1:-start}" in
    "start")
        print_status "🚀 Starting SARS-CoV-2 Dashboard..."
        check_docker
        check_docker_compose
        create_directories
        check_csv_file
        start_services
        show_service_urls
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        restart_services
        ;;
    "logs")
        show_logs
        ;;
    "status")
        docker-compose ps
        ;;
    "cleanup")
        cleanup
        ;;
    "help"|"--help"|"-h")
        echo "SARS-CoV-2 Dashboard Docker Management Script"
        echo ""
        echo "Usage: $0 [COMMAND]"
        echo ""
        echo "Commands:"
        echo "  start     Start all services (default)"
        echo "  stop      Stop all services"
        echo "  restart   Restart all services"
        echo "  logs      Show service logs"
        echo "  status    Show service status"
        echo "  cleanup   Stop services and clean up Docker resources"
        echo "  help      Show this help message"
        ;;
    *)
        print_error "Unknown command: $1"
        print_status "Use '$0 help' for usage information"
        exit 1
        ;;
esac