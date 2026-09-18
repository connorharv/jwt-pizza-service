#!/bin/bash

# Check if host is provided as a command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi
host=$1

pids=()

# Trap SIGINT (Ctrl+C) to execute the cleanup function
cleanup() {
  echo "Terminating background processes..."
  kill "${pids[@]}" 2>/dev/null
  exit 0
}
trap cleanup SIGINT

# Wrap curl command to return HTTP response codes
execute_curl() {
  echo $(eval "curl -s -o /dev/null -w \"%{http_code}\" $1")
}

# Function to login and get a token
login() {
  response=$(curl -s -X PUT $host/api/auth -d "{\"email\":\"$1\", \"password\":\"$2\"}" -H 'Content-Type: application/json')
  token=$(echo $response | jq -r '.token')
  echo $token
}

# --- Menu polling (fast, unauthenticated) ---
while true; do
  result=$(execute_curl $host/api/order/menu)
  echo "Requesting menu..." $result
  sleep 1
done &
pids+=($!)

# --- Failed logins (bad credentials), frequent ---
while true; do
  result=$(execute_curl "-X PUT \"$host/api/auth\" -d '{\"email\":\"unknown@jwt.com\", \"password\":\"bad\"}' -H 'Content-Type: application/json'")
  echo "Logging in with invalid credentials..." $result
  sleep 8
done &
pids+=($!)

# --- Franchisee: login, browse their franchises, logout, repeat ---
while true; do
  token=$(login "f@jwt.com" "franchisee")
  echo "Login franchisee..." $( [ -z "$token" ] && echo "false" || echo "true" )
  execute_curl "$host/api/franchise -H \"Authorization: Bearer $token\"" >/dev/null
  sleep 30
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out franchisee..." $result
  sleep 5
done &
pids+=($!)

# --- Admin: login, list users, list franchises, logout, repeat ---
while true; do
  token=$(login "a@jwt.com" "admin")
  echo "Login admin..." $( [ -z "$token" ] && echo "false" || echo "true" )
  execute_curl "$host/api/user?limit=10 -H \"Authorization: Bearer $token\"" >/dev/null
  execute_curl "$host/api/franchise?limit=10 -H \"Authorization: Bearer $token\"" >/dev/null
  sleep 20
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out admin..." $result
  sleep 10
done &
pids+=($!)

# --- Multiple concurrent diners buying pizzas, overlapping sessions so ---
# --- active users shows > 1 at a time, not just a single flickering user ---
simulate_diner() {
  local diner_id=$1
  while true; do
    token=$(login "d@jwt.com" "diner")
    echo "[diner $diner_id] Login..." $( [ -z "$token" ] && echo "false" || echo "true" )
    result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 1, \"storeId\":1, \"items\":[{ \"menuId\": 1, \"description\": \"Veggie\", \"price\": 0.05 }]}'  -H \"Authorization: Bearer $token\"")
    echo "[diner $diner_id] Bought a pizza..." $result
    sleep 8
    execute_curl "$host/api/order -H \"Authorization: Bearer $token\"" >/dev/null
    sleep 6
    result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
    echo "[diner $diner_id] Logging out..." $result
    sleep 4
  done &
  pids+=($!)
}

for i in 1 2 3; do
  simulate_diner $i
done

# --- Failed pizza order (too many items), every ~90s instead of every 5 min ---
while true; do
  token=$(login "d@jwt.com" "diner")
  echo "Login hungry diner..." $( [ -z "$token" ] && echo "false" || echo "true" )

  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i < 21; i++ ))
  do items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done

  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 1, \"storeId\":1, \"items\":[$items]}'  -H \"Authorization: Bearer $token\"")
  echo "Bought too many pizzas..." $result
  sleep 5
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out hungry diner..." $result
  sleep 85
done &
pids+=($!)

# Wait for the background processes to complete
wait "${pids[@]}"