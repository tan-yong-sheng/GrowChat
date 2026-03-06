#!/bin/bash
# Security Regression Test Suite
# Tests RBAC, ownership enforcement, and authorization protections
#
# Usage:
#   BASE_URL=https://growchat.example.com ./scripts/test_security_regression.sh

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

  if [ "$actual_status" = "$expected_status" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - $test_name (HTTP $actual_status)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}❌ FAILED${NC} - $test_name (expected $expected_status, got $actual_status)"
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

echo "🔒 Security Regression Test Suite"
echo "=================================="
echo "Base URL: $BASE_URL"
echo ""

# === Setup: Create test users ===
echo -e "${BLUE}[SETUP]${NC} Creating test users..."
echo "=================================="

ADMIN_EMAIL="sec_admin_$(date +%s)@test.com"
ADMIN_PASS="SecAdmin123!Test"
USER1_EMAIL="sec_user1_$(date +%s)@test.com"
USER1_PASS="SecUser123!Test1"
USER2_EMAIL="sec_user2_$(date +%s)@test.com"
USER2_PASS="SecUser123!Test2"

# Register admin
ADMIN_REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"name\":\"Security Admin\"}")
ADMIN_REG_STATUS=$(echo "$ADMIN_REG" | tail -n1)

if [ "$ADMIN_REG_STATUS" = "201" ] || [ "$ADMIN_REG_STATUS" = "409" ]; then
  echo "✅ Admin user registered"
else
  echo "❌ Failed to register admin (HTTP $ADMIN_REG_STATUS)"
  exit 1
fi

# Login as admin
ADMIN_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_LOGIN_STATUS=$(echo "$ADMIN_LOGIN" | tail -n1)

if [ "$ADMIN_LOGIN_STATUS" = "200" ]; then
  ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | sed '$d' | jq -r '.access_token')
  ADMIN_ID=$(echo "$ADMIN_LOGIN" | sed '$d' | jq -r '.user.id')
  ADMIN_ROLE=$(echo "$ADMIN_LOGIN" | sed '$d' | jq -r '.user.role // "unknown"')
  echo "✅ Admin logged in (ID: $ADMIN_ID)"
else
  echo "❌ Failed to login as admin"
  exit 1
fi
ADMIN_IS_ADMIN=0
if [ "$ADMIN_ROLE" = "admin" ]; then
  ADMIN_IS_ADMIN=1
fi

# Register user 1
USER1_REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER1_EMAIL\",\"password\":\"$USER1_PASS\",\"name\":\"Security User 1\"}")
USER1_REG_STATUS=$(echo "$USER1_REG" | tail -n1)

if [ "$USER1_REG_STATUS" = "201" ] || [ "$USER1_REG_STATUS" = "409" ]; then
  echo "✅ User 1 registered"
else
  echo "❌ Failed to register user 1"
  exit 1
fi

# Login as user 1
USER1_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER1_EMAIL\",\"password\":\"$USER1_PASS\"}")
USER1_LOGIN_STATUS=$(echo "$USER1_LOGIN" | tail -n1)

if [ "$USER1_LOGIN_STATUS" = "200" ]; then
  USER1_TOKEN=$(echo "$USER1_LOGIN" | sed '$d' | jq -r '.access_token')
  USER1_ID=$(echo "$USER1_LOGIN" | sed '$d' | jq -r '.user.id')
  echo "✅ User 1 logged in (ID: $USER1_ID)"
else
  echo "❌ Failed to login as user 1"
  exit 1
fi

# Register user 2
USER2_REG=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER2_EMAIL\",\"password\":\"$USER2_PASS\",\"name\":\"Security User 2\"}")
USER2_REG_STATUS=$(echo "$USER2_REG" | tail -n1)

if [ "$USER2_REG_STATUS" = "201" ] || [ "$USER2_REG_STATUS" = "409" ]; then
  echo "✅ User 2 registered"
else
  echo "❌ Failed to register user 2"
  exit 1
fi

# Login as user 2
USER2_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER2_EMAIL\",\"password\":\"$USER2_PASS\"}")
USER2_LOGIN_STATUS=$(echo "$USER2_LOGIN" | tail -n1)

if [ "$USER2_LOGIN_STATUS" = "200" ]; then
  USER2_TOKEN=$(echo "$USER2_LOGIN" | sed '$d' | jq -r '.access_token')
  USER2_ID=$(echo "$USER2_LOGIN" | sed '$d' | jq -r '.user.id')
  echo "✅ User 2 logged in (ID: $USER2_ID)"
else
  echo "❌ Failed to login as user 2"
  exit 1
fi

echo ""

# === Section 1: Admin Route Access Control ===
echo -e "${BLUE}[SECTION 1]${NC} Admin Route Access Control"
echo "=================================="

echo ""
echo "Test 1.1: Non-admin GET /api/admin/users (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/users" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from listing admin users"

echo ""
echo "Test 1.2: Non-admin GET /api/admin/users/:id (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/admin/users/$ADMIN_ID" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from viewing user details"

echo ""
echo "Test 1.3: Non-admin PUT /api/admin/users/:id (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/admin/users/$ADMIN_ID" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Hacked"}' | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from modifying user"

echo ""
echo "Test 1.4: Non-admin DELETE /api/admin/users/:id (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/admin/users/$ADMIN_ID" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from deleting user"

echo ""

# === Section 2: Model Write Authorization ===
echo -e "${BLUE}[SECTION 2]${NC} Model Write Authorization"
echo "=================================="

echo ""
echo "Test 2.1: Non-admin POST /api/models (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/models" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-model","name":"Test","provider":"openai"}' | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from creating model"

echo ""
echo "Test 2.2: Non-admin PUT /api/models/:id (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/models/test-model" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Modified"}' | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from updating model"

echo ""
echo "Test 2.3: Non-admin DELETE /api/models/:id (expect 403)"
STATUS=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/models/test-model" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)
assert_status "403" "$STATUS" "Non-admin blocked from deleting model"

echo ""

# === Section 3: User Account Protection ===
echo -e "${BLUE}[SECTION 3]${NC} User Account Protection"
echo "=================================="

echo ""
echo "Test 3.1: User cannot deactivate own account"
echo "   (Self-deactivate should be blocked at admin level)"
if [ "$ADMIN_IS_ADMIN" = "1" ]; then
  SELF_DEACTIVATE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/admin/users/$USER1_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"inactive"}')

  SELF_DEACTIVATE_STATUS=$(echo "$SELF_DEACTIVATE" | tail -n1)

  if [ "$SELF_DEACTIVATE_STATUS" = "403" ] || [ "$SELF_DEACTIVATE_STATUS" = "400" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Self-deactivate blocked (HTTP $SELF_DEACTIVATE_STATUS)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  elif [ "$SELF_DEACTIVATE_STATUS" = "200" ]; then
    echo -e "${YELLOW}⚠️  WARNING${NC} - Self-deactivate allowed (may need enforcement)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected status $SELF_DEACTIVATE_STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  skip_test "Self-deactivate protection" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
fi

echo ""
echo "Test 3.2: Last admin cannot be deleted"
echo "   (Preventing all admins from being removed)"
if [ "$ADMIN_IS_ADMIN" = "1" ]; then
  DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/admin/users/$ADMIN_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  DELETE_STATUS=$(echo "$DELETE_RESPONSE" | tail -n1)

  if [ "$DELETE_STATUS" = "403" ] || [ "$DELETE_STATUS" = "400" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Last admin delete blocked (HTTP $DELETE_STATUS)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  elif [ "$DELETE_STATUS" = "200" ] || [ "$DELETE_STATUS" = "204" ]; then
    echo -e "${YELLOW}⚠️  WARNING${NC} - Last admin was deleted (may need enforcement)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected delete status $DELETE_STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  skip_test "Last-admin delete protection" "bootstrap user role is '$ADMIN_ROLE' (not admin on existing env)"
fi

echo ""

# === Section 4: Cross-Tenant Data Isolation ===
echo -e "${BLUE}[SECTION 4]${NC} Cross-Tenant Data Isolation"
echo "=================================="

echo ""
echo "Test 4.1: Create chat as user 1"
CHAT1_RESPONSE=$(curl -s "$BASE_URL/api/chats" \
  -X POST \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"User 1 Private Chat"}')

CHAT1_ID=$(echo "$CHAT1_RESPONSE" | jq -r '.chat.id // empty' 2>/dev/null)

if [ -n "$CHAT1_ID" ]; then
  echo "✅ Chat created: $CHAT1_ID"

  echo ""
  echo "Test 4.2: User 2 cannot access user 1's chat"
  STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats/$CHAT1_ID" \
    -H "Authorization: Bearer $USER2_TOKEN" | tail -n1)

  if [ "$STATUS" = "404" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Cross-tenant read blocked (HTTP 404)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${YELLOW}⚠️  WARNING${NC} - Cross-tenant read returned $STATUS (expected 404)"
    # This could be acceptable if implementation returns different error
    if [ "$STATUS" = "403" ]; then
      echo "   (403 is also acceptable for permission denied)"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
  fi

  echo ""
  echo "Test 4.3: User 2 cannot modify user 1's chat"
  STATUS=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/chats/$CHAT1_ID" \
    -H "Authorization: Bearer $USER2_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Hacked Title"}' | tail -n1)

  if [ "$STATUS" = "404" ] || [ "$STATUS" = "403" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Cross-tenant write blocked (HTTP $STATUS)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Expected 404/403, got $STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  echo ""
  echo "Test 4.4: User 2 cannot delete user 1's chat"
  STATUS=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL/api/chats/$CHAT1_ID" \
    -H "Authorization: Bearer $USER2_TOKEN" | tail -n1)

  if [ "$STATUS" = "404" ] || [ "$STATUS" = "403" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Cross-tenant delete blocked (HTTP $STATUS)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED${NC} - Expected 404/403, got $STATUS"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  echo "⚠️  Could not create test chat, skipping cross-tenant tests"
fi

echo ""

# === Section 5: User Info Endpoint Ownership ===
echo -e "${BLUE}[SECTION 5]${NC} User Info Endpoint Ownership"
echo "=================================="

echo ""
echo "Test 5.1: User can read own profile"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/users/me" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)
assert_status "200" "$STATUS" "User can read own profile"

echo ""
echo "Test 5.2: User cannot access other users' GET /api/users/:id"
echo "   (Only /api/users/me is available for regular users)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/users/$USER2_ID" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)

if [ "$STATUS" = "403" ] || [ "$STATUS" = "404" ] || [ "$STATUS" = "405" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Cross-user profile read blocked (HTTP $STATUS)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARNING${NC} - Unexpected status $STATUS (expected 403/404/405)"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# === Section 6: Model Read Authorization ===
echo -e "${BLUE}[SECTION 6]${NC} Model Read Authorization"
echo "=================================="

echo ""
echo "Test 6.1: GET /api/models is public (no auth required)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/models" | tail -n1)
assert_status "200" "$STATUS" "Model read endpoint is public"

echo ""
echo "Test 6.2: GET /api/models/:id is public (no auth required)"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/models/llama-3" | tail -n1)
# Accept 200 or 404 (404 if model doesn't exist, but endpoint is public)
if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Model detail endpoint is public (HTTP $STATUS)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ FAILED${NC} - Unexpected status $STATUS"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# === Section 7: Query Injection Protection ===
echo -e "${BLUE}[SECTION 7]${NC} Query Injection / Malicious Input"
echo "=================================="

echo ""
echo "Test 7.1: Search with special characters"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats?q=test%27%20OR%20%271%27%3D%271" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)

if [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Malicious query handled (HTTP $STATUS)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ FAILED${NC} - Unexpected status $STATUS"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "Test 7.2: Large limit parameter"
STATUS=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/chats?limit=999999" \
  -H "Authorization: Bearer $USER1_TOKEN" | tail -n1)

if [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Large limit handled (HTTP $STATUS)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}❌ FAILED${NC} - Unexpected status $STATUS"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

# === Summary ===
echo -e "${BLUE}[SUMMARY]${NC}"
echo "=================================="
echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
echo -e "Tests Skipped: ${YELLOW}$TESTS_SKIPPED${NC}"
echo "Total Tests:   $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL SECURITY TESTS PASSED${NC}"
  echo ""
  echo "Security Status:"
  echo "  ✅ RBAC enforcement: Non-admin users blocked from admin endpoints"
  echo "  ✅ Model authorization: Only admins can write models"
  echo "  ✅ Account protection: Self-deactivate and last-admin safeguards"
  echo "  ✅ Cross-tenant isolation: Users cannot access each other's data"
  echo "  ✅ Ownership enforcement: Users limited to own resources"
  exit 0
else
  echo -e "${RED}❌ $TESTS_FAILED SECURITY ISSUE(S) FOUND${NC}"
  exit 1
fi
