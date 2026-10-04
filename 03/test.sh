#!/bin/sh
# CampusPulse smoke tests — 靜態檢查：檔案 / HTML 結構 / JS 邏輯 / CSS / README
# 用法：在本目錄執行 `sh test.sh`（或 `bash test.sh`）；離開碼 0=全過，1=有失敗。
cd "$(dirname "$0")" || exit 1

PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1) 必要檔案存在
for f in index.html styles.css app.js README.md; do
  if [ -f "$f" ]; then ok "file exists: $f"; else bad "missing file: $f"; fi
done

# 2) HTML 必要 ID / 結構
for id in searchInput sortNew sortHot resetBtn boardList tagCloud feed postModal detailModal postForm commentForm toast; do
  if grep -q "id=\"$id\"" index.html 2>/dev/null; then ok "html id present: $id"; else bad "html id missing: $id"; fi
done
if grep -q '<script type="module" src="./app.js"' index.html 2>/dev/null; then ok "html loads app.js as module"; else bad "html does not load app.js as module"; fi

# 3) JS 關鍵邏輯存在
for pat in 'seedPosts' 'localStorage' 'filteredPosts' 'renderFeed' 'renderComments' 'function vote' 'BOARDS' 'TAGS' 'campuspulse_posts_v1' 'campuspulse_votes_v1'; do
  if grep -q "$pat" app.js 2>/dev/null; then ok "js contains: $pat"; else bad "js missing: $pat"; fi
done

# 4) JS 語法檢查（有 node 才跑，否則 skip；相容 WSL 的 node.exe）
NODEBIN=""
if command -v node >/dev/null 2>&1; then NODEBIN="node";
elif command -v node.exe >/dev/null 2>&1; then NODEBIN="node.exe"; fi
if [ -n "$NODEBIN" ]; then
  if "$NODEBIN" --check app.js 2>/dev/null; then ok "$NODEBIN --check app.js"; else bad "$NODEBIN --check app.js failed"; fi
else
  echo "SKIP: node not found, skip syntax check"
fi

# 5) 種子資料至少涵蓋三看板
for b in '"chat"' '"market"' '"sport"'; do
  if grep -q "board: $b" app.js 2>/dev/null; then ok "seed covers board $b"; else bad "seed missing board $b"; fi
done

# 6) CSS 關鍵選擇器
for sel in '\.layout' '\.sidebar' '\.feed' '\.post-card' '\.modal-backdrop' '@media'; do
  if grep -q "$sel" styles.css 2>/dev/null; then ok "css contains: $sel"; else bad "css missing: $sel"; fi
done

# 7) README 提及專案與用法
if grep -q 'CampusPulse' README.md 2>/dev/null && grep -q 'index.html' README.md 2>/dev/null; then
  ok "README mentions CampusPulse + usage"
else
  bad "README incomplete"
fi

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
