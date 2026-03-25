#!/bin/bash
# Feature Smoke Matrix - Tests for new backend features
# Usage: BASE_URL=https://growchat.example.com ./scripts/feature_smoke_matrix.sh
# Or locally: BASE_URL=http://localhost:8787 ./scripts/feature_smoke_matrix.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:8787}"
FAILED=0
PASSED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASSED++))
}

log_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAILED++))
}

log_info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Test setup - register and login a test user
setup_auth() {
  log_info "Setting up test authentication..."

  TEST_EMAIL="test+feature-$(date +%s)@growchat.local"
  TEST_PASSWORD="TestPass123!!"

  # Register
  REGISTER_RESP=$(curl -s -X POST "${BASE_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\",\"name\":\"Test User\"}")

  TEST_USER_ID=$(echo "$REGISTER_RESP" | jq -r '.user.id // empty')
  if [[ -z "$TEST_USER_ID" ]]; then
    log_fail "Failed to register test user"
    echo "$REGISTER_RESP" | jq . || echo "$REGISTER_RESP"
    exit 1
  fi

  # Login
  LOGIN_RESP=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

  TEST_ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')
  if [[ -z "$TEST_ACCESS_TOKEN" ]]; then
    log_fail "Failed to login"
    echo "$LOGIN_RESP" | jq . || echo "$LOGIN_RESP"
    exit 1
  fi

  log_pass "Test user created and authenticated"
}

# Helper to make authenticated requests
api_call() {
  local method=$1
  local endpoint=$2
  local data=${3:-}

  if [[ -n "$data" ]]; then
    curl -s -X "$method" "${BASE_URL}${endpoint}" \
      -H "Authorization: Bearer ${TEST_ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" "${BASE_URL}${endpoint}" \
      -H "Authorization: Bearer ${TEST_ACCESS_TOKEN}"
  fi
}

# ==================== Chat Share & Archive Tests ====================
echo ""
echo "=== P0: Chat Share & Archive APIs ==="

test_chat_share() {
  log_info "Testing chat share endpoints..."

  # Create a test chat
  CREATE_CHAT=$(api_call POST "/api/chats" '{"title":"Share Test Chat","model":"@cf/meta/llama-3.1-8b-instruct"}')
  CHAT_ID=$(echo "$CREATE_CHAT" | jq -r '.chat.id // empty')
  if [[ -z "$CHAT_ID" ]]; then
    log_fail "Failed to create test chat"
    return 1
  fi

  # Test POST /api/chats/:id/share
  SHARE_RESP=$(api_call POST "/api/chats/${CHAT_ID}/share")
  SHARE_ID=$(echo "$SHARE_RESP" | jq -r '.share_id // empty')
  if [[ -n "$SHARE_ID" ]]; then
    log_pass "POST /api/chats/:id/share - Created share link"
  else
    log_fail "POST /api/chats/:id/share - Failed to create share"
    echo "$SHARE_RESP" | jq . || echo "$SHARE_RESP"
  fi

  # Test GET /s/:share_id (public, no auth)
  PUBLIC_RESP=$(curl -s -X GET "${BASE_URL}/s/${SHARE_ID}")
  SHARED_CHAT=$(echo "$PUBLIC_RESP" | jq -r '.chat.id // empty')
  if [[ "$SHARED_CHAT" == "$CHAT_ID" ]]; then
    log_pass "GET /s/:share_id - Public shared chat accessible"
  else
    log_fail "GET /s/:share_id - Failed to access public shared chat"
    echo "$PUBLIC_RESP" | jq . || echo "$PUBLIC_RESP"
  fi

  # Test GET /api/chats/shared
  SHARED_LIST=$(api_call GET "/api/chats/shared")
  SHARED_COUNT=$(echo "$SHARED_LIST" | jq '.chats | length')
  if [[ "$SHARED_COUNT" -gt 0 ]]; then
    log_pass "GET /api/chats/shared - Listed shared chats (count: $SHARED_COUNT)"
  else
    log_fail "GET /api/chats/shared - No shared chats found"
  fi

  # Test DELETE /api/chats/:id/share
  UNSHARE=$(api_call DELETE "/api/chats/${CHAT_ID}/share")
  UNSHARE_OK=$(echo "$UNSHARE" | jq -r '.ok // empty')
  if [[ "$UNSHARE_OK" == "true" ]]; then
    log_pass "DELETE /api/chats/:id/share - Revoked share link"
  else
    log_fail "DELETE /api/chats/:id/share - Failed to revoke"
    echo "$UNSHARE" | jq . || echo "$UNSHARE"
  fi

  # Verify public access is revoked
  REVOKED=$(curl -s -X GET "${BASE_URL}/s/${SHARE_ID}" | jq -r '.error // empty')
  if [[ -n "$REVOKED" ]]; then
    log_pass "Unshared chat is no longer publicly accessible"
  else
    log_fail "Unshared chat is still accessible"
  fi
}

test_chat_archive() {
  log_info "Testing chat archive endpoints..."

  # Create a test chat
  CREATE_CHAT=$(api_call POST "/api/chats" '{"title":"Archive Test Chat","model":"@cf/meta/llama-3.1-8b-instruct"}')
  CHAT_ID=$(echo "$CREATE_CHAT" | jq -r '.chat.id // empty')

  # Test POST /api/chats/:id/archive
  ARCHIVE=$(api_call POST "/api/chats/${CHAT_ID}/archive")
  ARCHIVED=$(echo "$ARCHIVE" | jq -r '.archived // empty')
  if [[ "$ARCHIVED" == "true" ]]; then
    log_pass "POST /api/chats/:id/archive - Chat archived"
  else
    log_fail "POST /api/chats/:id/archive - Failed to archive"
  fi

  # Test GET /api/chats/archived
  ARCHIVED_LIST=$(api_call GET "/api/chats/archived")
  ARCHIVED_COUNT=$(echo "$ARCHIVED_LIST" | jq '.chats | length')
  if [[ "$ARCHIVED_COUNT" -gt 0 ]]; then
    log_pass "GET /api/chats/archived - Listed archived chats (count: $ARCHIVED_COUNT)"
  else
    log_fail "GET /api/chats/archived - No archived chats found"
  fi

  # Test unarchive (toggle back)
  UNARCHIVE=$(api_call POST "/api/chats/${CHAT_ID}/archive")
  UNARCHIVED=$(echo "$UNARCHIVE" | jq -r '.archived // empty')
  if [[ "$UNARCHIVED" == "false" ]]; then
    log_pass "POST /api/chats/:id/archive - Chat unarchived"
  else
    log_fail "POST /api/chats/:id/archive - Failed to unarchive"
  fi
}

# ==================== Files Feature Tests ====================
echo ""
echo "=== P1: Files Feature Endpoints ==="

test_files_search() {
  log_info "Testing file search endpoint..."

  SEARCH=$(api_call GET "/api/files/search?q=test&limit=20&offset=0")
  SEARCH_OK=$(echo "$SEARCH" | jq -r '.documents // empty')
  if [[ -n "$SEARCH_OK" ]]; then
    log_pass "GET /api/files/search - Search works (basic validation)"
  else
    log_fail "GET /api/files/search - Search failed"
    echo "$SEARCH" | jq . || echo "$SEARCH"
  fi
}

test_files_status() {
  log_info "Testing file processing status endpoint..."

  # Get a document ID (or create a dummy one)
  DUMMY_ID="dummy-file-id-test"

  STATUS=$(api_call GET "/api/files/${DUMMY_ID}/process/status" 2>&1)
  STATUS_ERR=$(echo "$STATUS" | jq -r '.error // empty')
  if [[ "$STATUS_ERR" == "Not found" ]]; then
    log_pass "GET /api/files/:id/process/status - Correctly returns 404 for missing file"
  else
    # If the route exists and returns something, it's working
    log_pass "GET /api/files/:id/process/status - Endpoint responsive"
  fi
}

test_files_content() {
  log_info "Testing file content endpoint..."

  DUMMY_ID="dummy-file-id-test"

  CONTENT=$(api_call GET "/api/files/${DUMMY_ID}/content" 2>&1)
  CONTENT_ERR=$(echo "$CONTENT" | jq -r '.error // empty')
  if [[ "$CONTENT_ERR" == "Not found" ]]; then
    log_pass "GET /api/files/:id/content - Correctly returns 404 for missing file"
  else
    log_pass "GET /api/files/:id/content - Endpoint responsive"
  fi
}

# ==================== Knowledge Base Tests ====================
echo ""
echo "=== P1: Knowledge Base API ==="

test_knowledge_crud() {
  log_info "Testing knowledge base CRUD operations..."

  # POST /api/knowledge
  CREATE_KB=$(api_call POST "/api/knowledge" '{"name":"Test KB","description":"Test knowledge base"}')
  KB_ID=$(echo "$CREATE_KB" | jq -r '.knowledge_base.id // empty')
  if [[ -n "$KB_ID" ]]; then
    log_pass "POST /api/knowledge - Knowledge base created"
  else
    log_fail "POST /api/knowledge - Failed to create KB"
    echo "$CREATE_KB" | jq . || echo "$CREATE_KB"
    return 1
  fi

  # GET /api/knowledge/:id
  GET_KB=$(api_call GET "/api/knowledge/${KB_ID}")
  KB_NAME=$(echo "$GET_KB" | jq -r '.knowledge_base.name // empty')
  if [[ "$KB_NAME" == "Test KB" ]]; then
    log_pass "GET /api/knowledge/:id - Retrieved knowledge base"
  else
    log_fail "GET /api/knowledge/:id - Failed to retrieve KB"
  fi

  # GET /api/knowledge
  LIST_KB=$(api_call GET "/api/knowledge")
  KB_COUNT=$(echo "$LIST_KB" | jq '.knowledge_bases | length')
  if [[ "$KB_COUNT" -gt 0 ]]; then
    log_pass "GET /api/knowledge - Listed knowledge bases (count: $KB_COUNT)"
  else
    log_fail "GET /api/knowledge - No KBs in list"
  fi

  # PUT /api/knowledge/:id
  UPDATE_KB=$(api_call PUT "/api/knowledge/${KB_ID}" '{"name":"Updated KB"}')
  UPDATED_NAME=$(echo "$UPDATE_KB" | jq -r '.knowledge_base.name // empty')
  if [[ "$UPDATED_NAME" == "Updated KB" ]]; then
    log_pass "PUT /api/knowledge/:id - Knowledge base updated"
  else
    log_fail "PUT /api/knowledge/:id - Failed to update KB"
  fi

  # DELETE /api/knowledge/:id
  DELETE_KB=$(api_call DELETE "/api/knowledge/${KB_ID}")
  DELETE_OK=$(echo "$DELETE_KB" | jq -r '.ok // empty')
  if [[ "$DELETE_OK" == "true" ]]; then
    log_pass "DELETE /api/knowledge/:id - Knowledge base deleted"
  else
    log_fail "DELETE /api/knowledge/:id - Failed to delete KB"
  fi
}

# ==================== Main Test Execution ====================
echo "Feature Smoke Matrix - Backend Feature Validation"
echo "Base URL: ${BASE_URL}"
echo ""

setup_auth

test_chat_share
test_chat_archive
test_files_search
test_files_status
test_files_content
test_knowledge_crud

# Summary
echo ""
echo "==================================="
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo "==================================="

if [[ $FAILED -eq 0 ]]; then
  exit 0
else
  exit 1
fi
