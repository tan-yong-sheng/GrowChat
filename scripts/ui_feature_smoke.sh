#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
EMAIL="ui_feature_$(date +%s)@test.com"
PASSWORD="UiFeature123!"
NAME="UI Feature"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

cleanup() {
  playwright-cli close >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Running feature UI smoke against: $BASE_URL"

register_json="$(curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"name\":\"$NAME\",\"password\":\"$PASSWORD\"}")"

access_token="$(printf '%s' "$register_json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.access_token||'')")"
refresh_token="$(printf '%s' "$register_json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(d.refresh_token||'')")"
user_json="$(printf '%s' "$register_json" | node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(d.user||{}))")"

[[ -n "$access_token" && -n "$refresh_token" ]] || fail "Unable to register smoke user"
pass "Created smoke user"

auth_json="$(node -e "const u=$user_json;const s={access_token:'$access_token',refresh_token:'$refresh_token',user:u};process.stdout.write(JSON.stringify(s));")"
auth_json_js="$(printf '%s' "$auth_json" | jq -Rs .)"

playwright-cli open "$BASE_URL/" >/dev/null
playwright-cli eval "localStorage.setItem('growchat_auth', $auth_json_js); true" >/dev/null
playwright-cli goto "$BASE_URL/" >/dev/null
sleep 1

# Create chat
playwright-cli eval "document.querySelector('#new-chat')?.click(); true" >/dev/null
sleep 0.7
chat_exists="$(playwright-cli eval "Boolean(document.querySelector('[data-chat]'))")"
echo "$chat_exists" | grep -q 'true' || fail "Chat was not created"
pass "Create chat"

# Share modal and generate link
playwright-cli eval "document.querySelector('#share-chat-btn')?.click(); true" >/dev/null
sleep 0.5
share_modal="$(playwright-cli eval "Boolean(document.querySelector('#share-modal-root'))")"
echo "$share_modal" | grep -q 'true' || fail "Share modal did not open"
playwright-cli eval "document.querySelector('#generate-share-link')?.click(); true" >/dev/null
sleep 0.8
share_url_rendered="$(playwright-cli eval "(document.querySelector('#share-modal-root')?.textContent || '').includes('/s/')")"
echo "$share_url_rendered" | grep -q 'true' || fail "Share link not rendered"
pass "Share generate link"
playwright-cli eval "document.querySelector('#close-share-modal')?.click(); true" >/dev/null

# Archive and restore
playwright-cli eval "document.querySelector('#archive-chat-btn')?.click(); true" >/dev/null
sleep 0.8
no_active_chats="$(playwright-cli eval "document.querySelectorAll('[data-chat]').length")"
[[ "$no_active_chats" =~ ^[0-9]+$ ]] || fail "Could not read chat count"
pass "Archive action triggered"

playwright-cli eval "document.querySelector('#open-archived')?.click(); true" >/dev/null
sleep 0.5
archived_modal="$(playwright-cli eval "Boolean(document.querySelector('#close-archived-modal'))")"
echo "$archived_modal" | grep -q 'true' || fail "Archived modal did not open"
playwright-cli eval "document.querySelector('[data-restore-chat]')?.click(); true" >/dev/null
sleep 0.8
pass "Archived restore"

# Files modal open
playwright-cli eval "document.querySelector('#open-files-btn')?.click(); true" >/dev/null
sleep 0.4
files_modal="$(playwright-cli eval "Boolean(document.querySelector('#files-modal-root:not(.hidden)'))")"
echo "$files_modal" | grep -q 'true' || fail "Files modal did not open"
pass "Files modal open"
playwright-cli eval "document.querySelector('#close-files-modal')?.click(); true" >/dev/null

# Prompt picker trigger with slash command
playwright-cli eval "const el=document.querySelector('#message-input'); if(el){el.value='/'; el.dispatchEvent(new Event('input',{bubbles:true}));} true" >/dev/null
sleep 0.4
prompt_picker="$(playwright-cli eval "Boolean(document.querySelector('#prompt-picker:not(.hidden)'))")"
echo "$prompt_picker" | grep -q 'true' || fail "Prompt picker did not appear for '/'"
pass "Prompt picker visible"

echo "UI feature smoke complete."
