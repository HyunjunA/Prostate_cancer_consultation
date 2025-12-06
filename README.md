# Dashboard - Quick Start Guide

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.10+

## Starting the Application

First, navigate to the backend directory using cd, then enter and execute the following command.

```bash
cd Backend
docker compose -f docker-compose.yml up
```

Once you see a message like the one below, you can verify that the pages are displayed correctly by visiting http://localhost/genomic-metadata and http://localhost/flu-ve in your browser.

```
"GET /nginx-health HTTP/1.1" 200 2 "-" "curl/8.14.1" "-"
```

## Stopping the Application

```bash
docker compose down
```
