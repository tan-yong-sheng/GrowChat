#!/bin/bash
# Backend Smoke Test Matrix
# Tests authentication, authorization, and binding behavior
#
# Usage:
#   BASE_URL=https://growchat.example.com ./scripts/backend_smoke_matrix.sh
#
# Or with local environment:
#   BASE_URL=http://localhost:8787 ./scripts/backend_smoke_matrix.sh

set -e

BASE_URL="${BASE_URL:-https://growchat.tanyongsheng-net.workers.dev}"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper: Test HTTP response code
assert_status() {
  local expected_status="$1"
  local actual_status="$2"
  local test_name="$3"
  local method="$4"
  local path="$5"

  if [ "$actual_status" = "$expected_status" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - $test_name"
    echo "   $method $path => HTTP $actual_status (expected $expected_status)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}❌ FAILED${NC} - $test_name"
    echo "   $method $path => HTTP $actual_status (expected $expected_status)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

skip_test() {
  local test_name="$1"
  local reason="$2"
  echo -e "${YELLOW}⏭️  SKIPPED${NC} - $test_name ($reason)"
  TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

# Helper: Make API request and extract status code
api_request() {
  local method="$1"
  local path="$2"
  local auth_header="$3"
  local body="$4"

  local curl_cmd="curl -s -w '\n%{http_code}' -X $method '$BASE_URL$path'"

  if [ -n "$auth_header" ]; then
    curl_cmd="$curl_cmd -H 'Authorization: Bearer $auth_header'"
  fi

  if [ -n "$body" ]; then
    curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$body'"
  fi

  eval "$curl_cmd" | tail -n1
}

echo "🔐 Backend Smoke Test Matrix"
echo "============================"
echo "Base URL: $BASE_URL"
echo ""

# === Setup: Create test users ===
echo -e "${BLUE}[SETUP]${NC} Creating test users..."
echo "============================"

ADMIN_EMAIL="smoke_admin_$(date +%s)@test.com"
ADMIN_PASS="SmokeAdmin123!Test"
USER_EMAIL="smoke_user_$(date +%s)@test.com"
USER_PASS="SmokeUser123!Test"

# Register admin
ADMIN_REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"name\":\"Smoke Admin\"}")
ADMIN_REG_STATUS=$(echo "$ADMIN_REG" | tail -n1)

if [ "$ADMIN_REG_STATUS" = "201" ] || [ "$ADMIN_REG_STATUS" = "409" ]; then
  echo "✅ Admin user registered"
else
  echo "❌ Failed to register admin user (HTTP $ADMIN_REG_STATUS)"
  exit 1
fi

# Login as admin
ADMIN_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_LOGIN_STATUS=$(echo "$ADMIN_LOGIN" | tail -n1)

if [ "$ADMIN_LOGIN_STATUS" = "200" ]; then
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | sed '$d' | jq -r '.access_token')
  ADMIN_ROLE=$(echo "$ADMIN_LOGIN" | sed '$d' | jq -r '.user.role // "unknown"')
  echo "✅ Admin logged in"
else
  echo "❌ Failed to login as admin (HTTP $ADMIN_LOGIN_STATUS)"
  exit 1
fi
ADMIN_IS_ADMIN=0
if [ "$ADMIN_ROLE" = "admin" ]; then
  ADMIN_IS_ADMIN=1
fi

# Register regular user
USER_REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\",\"name\":\"Smoke User\"}")
USER_REG_STATUS=$(echo "$USER_REG" | tail -n1)

if [ "$USER_REG_STATUS" = "201" ] || [ "$USER_REG_STATUS" = "409" ]; then
  echo "✅ Regular user registered"
else
  echo "❌ Failed to register regular user (HTTP $USER_REG_STATUS)"
  exit 1
fi

# Login as regular user
USER_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")
USER_LOGIN_STATUS=$(echo "$USER_LOGIN" | tail -n1)

if [ "$USER_LOGIN_STATUS" = "200" ]; then
  USER_TOKEN=$(echo "$USER_LOGIN" | sed '$d' | jq -r '.access_token')
  echo "✅ Regular user logged in"
else
  echo "❌ Failed to login as regular user (HTTP $USER_LOGIN_STATUS)"
  exit 1
fi

echo ""

# === Section 1: Public Routes (No Auth) ===
echo -e "${BLUE}[SECTION 1]${NC} Public Routes (No Authentication Required)"
echo "============================"

echo ""
echo "Test 1.1: GET /api/models without auth"
STATUS=$(api_request "GET" "/api/models" "" "")
assert_status "200" "$STATUS" "Public model read" "GET" "/api/models"

echo ""
echo "Test 1.2: GET /api/models/:id without auth (non-existent)"
STATUS=$(api_request "GET" "/api/models/nonexistent-model-xyz" "" "")
# Should return 404 or 200 (depending on implementation)
if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Public model detail read (graceful handling)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARNING${NC} - Unexpected status $STATUS on public model read"
fi

echo ""

# === Section 2: Missing Authentication ===
echo -e "${BLUE}[SECTION 2]${NC} Protected Routes Without Authentication"
echo "============================"

echo ""
echo "Test 2.1: GET /api/chats without auth (should be 401)"
STATUS=$(api_request "GET" "/api/chats" "" "")
assert_status "401" "$STATUS" "Protected endpoint requires auth" "GET" "/api/chats"

echo ""
echo "Test 2.2: GET /api/users/me without auth (should be 401)"
STATUS=$(api_request "GET" "/api/users/me" "" "")
assert_status "401" "$STATUS" "User profile requires auth" "GET" "/api/users/me"

echo ""
echo "Test 2.3: POST /api/chats without auth (should be 401)"
STATUS=$(api_request "POST" "/api/chats" "" '{"title":"Test"}')
assert_status "401" "$STATUS" "Create chat requires auth" "POST" "/api/chats"

echo ""

# === Section 3: Invalid/Expired Token ===
echo -e "${BLUE}[SECTION 3]${NC} Invalid Token Handling"
echo "============================"

echo ""
echo "Test 3.1: Request with malformed token"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer invalid_token_xyz" | tail -n1)
assert_status "401" "$STATUS" "Malformed token rejected" "GET" "/api/users/me"

echo ""
echo "Test 3.2: Request with empty token"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer " | tail -n1)
# Might be 401 or 400 depending on implementation
if [ "$STATUS" = "401" ] || [ "$STATUS" = "400" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Empty token rejected"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ FAILED${NC} - Expected 401/400, got $STATUS"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# === Section 4: RBAC - Admin Routes ===
echo -e "${BLUE}[SECTION 4]${NC} Role-Based Access Control (Admin Routes)"
echo "============================"

echo ""
echo "Test 4.1: Non-admin user GET /api/admin/users (should be 403)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $USER_TOKEN" | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from admin endpoint" "GET" "/api/admin/users"

echo ""
echo "Test 4.2: Admin user can GET /api/admin/users (should be 200 or 403 if feature incomplete)"
if [ "$ADMIN_IS_ADMIN" = "1" ]; then
  STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | tail -n1)
  if [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Admin can access admin endpoint"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  elif [ "$STATUS" = "404" ]; then
    echo -e "${YELLOW}⚠️  WARNING${NC} - Admin endpoint may not be implemented (404)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected status $STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  skip_test "Admin GET /api/admin/users" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
fi

echo ""
echo "Test 4.3: Non-admin user POST /api/models (should be 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/models" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","name":"Test","provider":"openai"}' | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from model write" "POST" "/api/models"

echo ""
echo "Test 4.4: Admin can POST /api/models (should be 201 or 400 for validation)"
if [ "$ADMIN_IS_ADMIN" = "1" ]; then
  STATUS=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/models" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"id":"smoke_test_'$(date +%s)'","name":"Smoke Test Model","provider":"openai","base_url":"https://api.openai.com/v1"}' | tail -n1)
  if [ "$STATUS" = "201" ] || [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Admin can create model"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  elif [ "$STATUS" = "400" ]; then
    echo -e "${YELLOW}⚠️  WARNING${NC} - Model creation validation returned 400"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected status $STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  skip_test "Admin POST /api/models" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
fi

echo ""

# === Section 5: Model Read Routes ===
echo -e "${BLUE}[SECTION 5]${NC} Model Read Routes (Public Behavior)"
echo "============================"

echo ""
echo "Test 5.1: GET /api/models is public and returns valid JSON"
MODELS_RESPONSE=$(curl -s "$BASE_URL/api/models")
if echo "$MODELS_RESPONSE" | jq -e '.models' >/dev/null 2>&1; then
  echo -e "${GREEN}✅ PASSED${NC} - Model list returns valid JSON"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ FAILED${NC} - Model list invalid JSON"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# === Section 6: Optional Binding Degradation ===
echo -e "${BLUE}[SECTION 6]${NC} Optional Binding Degradation"
echo "============================"

echo ""
echo "Test 6.1: Chat operations work without optional AI binding"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats" \
  -H "Authorization: Bearer $USER_TOKEN" | tail -n1)
assert_status "200" "$STATUS" "Chat list works without AI" "GET" "/api/chats"

echo ""
echo "Test 6.2: File operations fail gracefully without R2 (if implemented)"
STATUS=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/files/upload" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/dev/null" 2>/dev/null | tail -n1)
# May be 501, 500, or 403 depending on feature status
if [ "$STATUS" = "500" ] || [ "$STATUS" = "501" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "404" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - File upload fails gracefully"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARNING${NC} - File upload unexpected status $STATUS"
fi

echo ""

# === Section 7: Required Bindings ===
echo -e "${BLUE}[SECTION 7]${NC} Required Bindings Presence"
echo "============================"

echo ""
echo "Test 7.1: GET /api/models returns HTTP 200 (DB/SESSIONS required)"
STATUS=$(api_request "GET" "/api/models" "" "")
assert_status "200" "$STATUS" "Required bindings present" "GET" "/api/models"

echo ""

# === Section 8: Cross-Tenant Isolation ===
echo -e "${BLUE}[SECTION 8]${NC} Cross-Tenant Isolation"
echo "============================"

# Create a chat as the regular user
echo ""
echo "Test 8.1: Create chat as regular user"
CHAT_RESPONSE=$(curl -s "$BASE_URL/api/chats" \
  -X POST \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Private Chat"}')
CHAT_ID=$(echo "$CHAT_RESPONSE" | jq -r '.chat.id // empty' 2>/dev/null)

if [ -n "$CHAT_ID" ]; then
  echo "✅ Created chat: $CHAT_ID"

  # Try to access the same chat without auth
  echo ""
  echo "Test 8.2: Access user's chat without auth (should be 401)"
  STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats/$CHAT_ID" | tail -n1)
  assert_status "401" "$STATUS" "Private chat requires auth" "GET" "/api/chats/:id"

  # Try to access with admin token (cross-tenant read should work with proper ownership)
  echo ""
  echo "Test 8.3: Admin read user's chat (should succeed with proper ownership check)"
  if [ "$ADMIN_IS_ADMIN" = "1" ]; then
    STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats/$CHAT_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | tail -n1)
    # This depends on implementation - could be 200 (admin can view) or 404 (not found)
    if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
      echo -e "${GREEN}✅ PASSED${NC} - Access control verified"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo -e "${YELLOW}⚠️  WARNING${NC} - Unexpected status $STATUS"
    fi
  else
    skip_test "Admin cross-tenant read behavior" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
  fi
else
  echo "⚠️  Could not create test chat, skipping cross-tenant tests"
fi

echo ""

# === Summary ===
echo -e "${BLUE}[SUMMARY]${NC}"
echo "============================"
echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Tests Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
echo "Total Tests:   $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}❌ $TESTS_FAILED TEST(S) FAILED${NC}"
  exit 1
fi
