for i in {1..130}; do \
  curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:8000/api/studies?limit=1&offset=0"; \
done