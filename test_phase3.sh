#!/bin/bash
# Phase 3 Feature Test Script
# Tests User Management and Model Configuration with Admin Bootstrap

set -e

# Allow BASE_URL override for testing against local/different environments
BASE="${BASE_URL:-https://growchat.tanyongsheng-net.workers.dev}"
ADMIN_EMAIL="admin_bootstrap_$(date +%s)@test.com"
ADMIN_PASS="AdminTest123!Bootstrap"
TEST_EMAIL="phase3_test_$(date +%s)@test.com"
TEST_PASS="Phase3Test123!"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Helper function for test assertions
assert_http_code() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"

  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - $test_name (HTTP $actual)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}❌ FAILED${NC} - $test_name (expected HTTP $expected, got $actual)"
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

echo "🧪 Phase 3 Feature Testing"
echo "=========================="
echo "Base URL: $BASE"
echo ""

# === SECTION: Public Routes (No Auth Required) ===
echo ""
echo -e "${YELLOW}[SECTION 1] Public Routes${NC}"
echo "=================================="

# Test 1: Get available models (no auth required)
echo ""
echo "Test 1.1: GET /api/models (no auth)"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/models")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

assert_http_code "$HTTP_CODE" "200" "GET /api/models without auth" || true
if [ "$HTTP_CODE" = "200" ]; then
    MODEL_COUNT=$(echo "$BODY" | jq -r '.models | length' 2>/dev/null || echo '0')
    echo "   Models available: $MODEL_COUNT"
fi

# === SECTION: Admin Bootstrap ===
echo ""
echo -e "${YELLOW}[SECTION 2] Admin Bootstrap${NC}"
echo "=================================="

echo ""
echo "Test 2.1: Register admin user (or reuse existing)"
ADMIN_REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"name\":\"Admin Bootstrap\"}")

ADMIN_REGISTER_HTTP=$(echo "$ADMIN_REGISTER_RESPONSE" | tail -n1)
ADMIN_REGISTER_BODY=$(echo "$ADMIN_REGISTER_RESPONSE" | sed '$d')

# 201 = new user, 409 = already exists (both are acceptable for bootstrap)
if [ "$ADMIN_REGISTER_HTTP" = "201" ] || [ "$ADMIN_REGISTER_HTTP" = "409" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Admin user registered/exists (HTTP $ADMIN_REGISTER_HTTP)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAILED${NC} - Admin registration failed (HTTP $ADMIN_REGISTER_HTTP)"
    echo "Response: $ADMIN_REGISTER_BODY"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    exit 1
fi

echo ""
echo "Test 2.2: Login as admin to get token"
ADMIN_LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_LOGIN_HTTP=$(echo "$ADMIN_LOGIN_RESPONSE" | tail -n1)
ADMIN_LOGIN_BODY=$(echo "$ADMIN_LOGIN_RESPONSE" | sed '$d')

if [ "$ADMIN_LOGIN_HTTP" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Admin login successful (HTTP 200)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    ADMIN_TOKEN=$(echo "$ADMIN_LOGIN_BODY" | jq -r '.access_token' 2>/dev/null || echo '')
    ADMIN_ID=$(echo "$ADMIN_LOGIN_BODY" | jq -r '.user.id' 2>/dev/null || echo '')
    ADMIN_ROLE=$(echo "$ADMIN_LOGIN_BODY" | jq -r '.user.role' 2>/dev/null || echo '')
    echo "   Admin ID: $ADMIN_ID"
    echo "   Admin Role: $ADMIN_ROLE"
else
    echo -e "${RED}❌ FAILED${NC} - Admin login failed (HTTP $ADMIN_LOGIN_HTTP)"
    echo "Response: $ADMIN_LOGIN_BODY"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    exit 1
fi

ADMIN_IS_ADMIN=0
if [ "$ADMIN_ROLE" = "admin" ]; then
    ADMIN_IS_ADMIN=1
fi

# === SECTION: Regular User Registration and Auth ===
echo ""
echo -e "${YELLOW}[SECTION 3] Regular User Registration & Auth${NC}"
echo "=================================="

echo ""
echo "Test 3.1: Register regular user (will fail role tests)"
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"name\":\"Phase 3 Test\"}")

REGISTER_HTTP=$(echo "$REGISTER_RESPONSE" | tail -n1)
REGISTER_BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

if [ "$REGISTER_HTTP" = "201" ] || [ "$REGISTER_HTTP" = "409" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Test user registered/exists (HTTP $REGISTER_HTTP)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAILED${NC} - Test user registration (HTTP $REGISTER_HTTP)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    exit 1
fi

echo ""
echo "Test 3.2: Login as regular user"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")

LOGIN_HTTP=$(echo "$LOGIN_RESPONSE" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

assert_http_code "$LOGIN_HTTP" "200" "Test user login" || exit 1
TOKEN=$(echo "$LOGIN_BODY" | jq -r '.access_token' 2>/dev/null || echo '')
USER_ROLE=$(echo "$LOGIN_BODY" | jq -r '.user.role' 2>/dev/null || echo '')
echo "   User Role: $USER_ROLE"

# === SECTION: Authorization Tests ===
echo ""
echo -e "${YELLOW}[SECTION 4] Authorization & RBAC${NC}"
echo "=================================="

echo ""
echo "Test 4.1: Non-admin user should not POST /api/models (expect 403)"
POST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/models" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"id\":\"custom-test\",\"name\":\"Custom Test\",\"provider\":\"openai\",\"base_url\":\"https://api.openai.com/v1\"}")

POST_HTTP=$(echo "$POST_RESPONSE" | tail -n1)

if [ "$POST_HTTP" = "403" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Non-admin POST rejected (HTTP 403)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠️  WARNING${NC} - Expected 403, got HTTP $POST_HTTP (may indicate model creation allowed for non-admin)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "Test 4.2: Admin user CAN POST /api/models"
if [ "$ADMIN_IS_ADMIN" = "1" ]; then
    ADMIN_POST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/models" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -d "{\"id\":\"custom-model-phase3-$(date +%s)\",\"name\":\"Custom Test Model\",\"provider\":\"openai\",\"base_url\":\"https://api.openai.com/v1\",\"description\":\"Test model\",\"max_tokens\":8192}")

    ADMIN_POST_HTTP=$(echo "$ADMIN_POST_RESPONSE" | tail -n1)
    ADMIN_POST_BODY=$(echo "$ADMIN_POST_RESPONSE" | sed '$d')

    assert_http_code "$ADMIN_POST_HTTP" "201" "Admin POST /api/models" || true
    if [ "$ADMIN_POST_HTTP" = "201" ]; then
        MODEL_NAME=$(echo "$ADMIN_POST_BODY" | jq -r '.model.name' 2>/dev/null || echo 'N/A')
        echo "   Created model: $MODEL_NAME"
    fi
else
    skip_test "Admin POST /api/models" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
fi

echo ""
echo "Test 4.3: Non-admin access to /api/admin/users (expect 403)"
ADMIN_GET_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/admin/users" \
  -H "Authorization: Bearer $TOKEN")

ADMIN_GET_HTTP=$(echo "$ADMIN_GET_RESPONSE" | tail -n1)

assert_http_code "$ADMIN_GET_HTTP" "403" "Non-admin GET /api/admin/users" || true

# === SECTION: User Profile Management ===
echo ""
echo -e "${YELLOW}[SECTION 5] User Profile Management${NC}"
echo "=================================="

echo ""
echo "Test 5.1: Get user profile"
USER_GET_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/users/me" \
  -H "Authorization: Bearer $TOKEN")

USER_GET_HTTP=$(echo "$USER_GET_RESPONSE" | tail -n1)
USER_GET_BODY=$(echo "$USER_GET_RESPONSE" | sed '$d')

assert_http_code "$USER_GET_HTTP" "200" "GET /api/users/me" || true
if [ "$USER_GET_HTTP" = "200" ]; then
    USER_NAME=$(echo "$USER_GET_BODY" | jq -r '.user.name' 2>/dev/null || echo 'N/A')
    echo "   User: $USER_NAME"
fi

echo ""
echo "Test 5.2: Update user profile"
USER_PUT_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE/api/users/me" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\":\"Phase 3 Tester Updated\",\"settings\":{\"theme\":\"dark\"}}")

USER_PUT_HTTP=$(echo "$USER_PUT_RESPONSE" | tail -n1)

assert_http_code "$USER_PUT_HTTP" "200" "PUT /api/users/me" || true

# === SECTION: Summary ===
echo ""
echo -e "${YELLOW}[SUMMARY]${NC}"
echo "=================================="
echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Tests Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
echo -e "Total Tests:   $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo "=================================="
    exit 0
else
    echo ""
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo "=================================="
    exit 1
fi
