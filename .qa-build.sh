_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
GSTACK_ROOT="$HOME/.codex/skills/gstack"
[ -n "$_ROOT" ] && [ -d "$_ROOT/.agents/skills/gstack" ] && GSTACK_ROOT="$_ROOT/.agents/skills/gstack"
echo "GSTACK_ROOT: $GSTACK_ROOT"
if [ -d "$GSTACK_ROOT" ]; then
  cd "$GSTACK_ROOT" && ./setup
else
  echo "GSTACK_ROOT not found"
fi
