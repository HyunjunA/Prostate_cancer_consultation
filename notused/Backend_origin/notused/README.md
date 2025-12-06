# SARS-CoV-2 Research Dashboard

A comprehensive web application for filtering and analyzing SARS-CoV-2 research data with FastAPI backend and PostgreSQL database.

## 🚀 Quick Start with Docker

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 1.29 or higher)

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd sars-cov-2-dashboard

# Make the startup script executable
chmod +x start.sh

# (Optional) Place your CSV data file in the root directory
# The file should be named: Processed_Data_DB.csv
```

### 2. Start the Application

```bash
# Start all services
./start.sh

# Or manually with docker-compose
docker-compose up --build -d
```

### 3. Access the Application

Once started, you can access:

- **API Documentation**: http://localhost:8000/docs
- **API Health Check**: http://localhost:8000/health
- **Database Admin (PgAdmin)**: http://localhost:5050

## 📋 Available Services

### Backend API (Port 8000)

- FastAPI application with automatic API documentation
- RESTful endpoints for data filtering and analysis
- CSV upload functionality
- Real-time health monitoring

### PostgreSQL Database (Port 5432)

- Primary data storage
- Optimized for research data queries
- Automatic initialization and migration

### PgAdmin (Port 5050)

- Web-based database administration
- Credentials: `admin@sarscov.com` / `admin123`

## 🛠️ Management Commands

Use the provided startup script for easy management:

```bash
# Start services
./start.sh start

# Stop services
./start.sh stop

# Restart services
./start.sh restart

# View logs
./start.sh logs

# Check status
./start.sh status

# Clean up resources
./start.sh cleanup

# Show help
./start.sh help
```

## 📊 API Endpoints

### Core Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `GET /docs` - Interactive API documentation

### Data Operations

- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/studies/filter-options` - Available filter options
- `POST /api/studies/filter` - Filter and retrieve studies
- `POST /api/studies/aggregation/{field}` - Aggregation data for charts
- `POST /api/studies/upload` - Upload CSV data

### Example API Usage

```bash
# Check API health
curl http://localhost:8000/health

# Get dashboard statistics
curl http://localhost:8000/api/dashboard/stats

# Get filter options
curl http://localhost:8000/api/studies/filter-options

# Filter studies (POST request with JSON body)
curl -X POST "http://localhost:8000/api/studies/filter" \
     -H "Content-Type: application/json" \
     -d '{
       "countries": ["Ethiopia", "South Africa"],
       "age_reported": true,
       "page": 1,
       "size": 10
     }'
```

## 📁 Project Structure

```
sars-cov-2-dashboard/
├── docker-compose.yml          # Docker services configuration
├── Dockerfile                  # Python application container
├── requirements.txt            # Python dependencies
├── start.sh                   # Startup management script
├── .dockerignore              # Docker build exclusions
├── .env.example               # Environment variables template
├── main.py                    # FastAPI application
├── models.py                  # Database models and schemas
├── init_db.py                 # Database initialization
├── wait_for_db.py            # Database connection wait script
├── logs/                      # Application logs
├── uploads/                   # Uploaded files
├── data/                      # Data files
└── Processed_Data_DB.csv  # Initial data (optional)
```

## 🔧 Configuration

### Environment Variables

Key configuration options (set in docker-compose.yml):

```yaml
# Database
DATABASE_URL: postgresql://sarscov_user:secure_password_123@postgres:5432/sarscov_db

# API
API_HOST: 0.0.0.0
API_PORT: 8000
DEBUG: true

# Security
SECRET_KEY: your-super-secret-key-change-this-in-production

# CORS
CORS_ORIGINS: ["http://localhost:3000", "http://localhost:5173"]
```

### Database Configuration

The PostgreSQL database is automatically configured with:

- **Database**: `sarscov_db`
- **User**: `sarscov_user`
- **Password**: `secure_password_123`
- **Port**: `5432`

## 📤 Data Upload

### CSV Format

The application expects CSV files with the following columns:

- `CovidenceID` - Unique study identifier
- `PMID` - PubMed ID
- `Title` - Study title
- `publication.year` - Publication year
- `Study.location.1` - Primary study location
- `Repository` - Data repository
- `Age`, `Gender`, etc. - Boolean fields (yes/no)

### Upload Methods

1. **Initial Load**: Place CSV file as `Processed_Data_DB.csv` in root directory
2. **API Upload**: Use the `/api/studies/upload` endpoint
3. **Manual**: Connect to database and import directly

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**

   ```bash
   # Check what's using the ports
   lsof -i :8000
   lsof -i :5432
   lsof -i :5050
   ```

2. **Database Connection Issues**

   ```bash
   # Check database logs
   docker-compose logs postgres

   # Check if database is ready
   docker-compose exec postgres pg_isready -U sarscov_user -d sarscov_db
   ```

3. **Application Startup Issues**

   ```bash
   # Check application logs
   docker-compose logs backend

   # Restart services
   ./start.sh restart
   ```

### Log Monitoring

```bash
# View all logs
./start.sh logs

# View specific service logs
docker-compose logs backend
docker-compose logs postgres
docker-compose logs pgadmin
```

### Database Access

Connect to the database directly:

```bash
# Using Docker
docker-compose exec postgres psql -U sarscov_user -d sarscov_db

# Using external client
psql -h localhost -p 5432 -U sarscov_user -d sarscov_db
```

## 🧪 Development

### Local Development Setup

1. **Python Environment**

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Environment Variables**

   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Run Locally**

   ```bash
   # Start database only
   docker-compose up postgres -d

   # Run API locally
   python main.py
   ```

### Testing

```bash
# Run the application
./start.sh start

# Test API endpoints
curl http://localhost:8000/health
curl http://localhost:8000/api/dashboard/stats
```

## 📝 Data Schema

### Study Model Fields

- **Basic Info**: ID, title, PMID, publication year
- **Location**: Primary and secondary study locations
- **Repository**: Data repository information
- **Sequences**: Sample counts and sequence ID reporting
- **Demographics**: Age, gender, race/ethnicity reporting flags
- **Clinical**: Comorbidities, outcomes, treatment reporting flags

### Database Indexes

Optimized indexes for:

- Publication year queries
- Location-based filtering
- Repository searches
- Boolean field combinations
- Full-text search on titles

## 🔒 Security Notes

- Change default passwords in production
- Use environment variables for sensitive data
- Enable SSL/TLS for production deployments
- Regularly update Docker images
- Monitor access logs

## 📄 License

[Add your license information here]

## 🤝 Contributing

[Add contribution guidelines here]

## 📞 Support

For issues and questions:

- Check the troubleshooting section
- Review application logs
- Open an issue in the repository
