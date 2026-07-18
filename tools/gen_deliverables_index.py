#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""成果物一覧HTMLの生成（pack issue #25 の試験実装）。

正本: docs/10-management/deliverables-ledger.md（Markdown表）
出力: docs/10-management/deliverables-index.html（一方向生成ビュー。直接編集しない）

- 更新日は git log（未コミットのファイルは mtime）から機械取得する
- 「人間確認=済」なのに更新日がOK日付より新しい行は鮮度切れとして強調する

使い方:
  python3 tools/gen_deliverables_index.py
"""
import html
import re
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
LEDGER = DOCS / "10-management/deliverables-ledger.md"
OUT = DOCS / "10-management/deliverables-index.html"


def updated_date(path: Path):
    """git最終コミット日（YYYY-MM-DD）。未コミット変更・未追跡ならworking treeの更新日を返す。"""
    if not path.is_file():
        return None, "欠落"
    rel = path.relative_to(ROOT)
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", str(rel)],
        cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if not dirty:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(rel)],
            cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if out:
            return out, "コミット済"
    mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
    return mtime, "未コミット"


def parse_ledger():
    rows = []
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|") or re.match(r"^\|\s*(表示名|---)", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7:
            continue
        rows.append(dict(zip(
            ["name", "path", "phase", "checked", "ok_date", "checker", "note"], cells)))
    return rows


CSS = """
  :root { --ink:#37352f; --sub:#787774; --line:rgba(55,53,47,.14); --line-soft:rgba(55,53,47,.08);
    --bg:#fbfbfa; --card:#fff; --accent:#2383e2; --done:#1c7f4e; --done-soft:#dbeddb;
    --todo:#6f6e69; --todo-soft:#efefed; --warn:#9a6700; --warn-soft:#fbf3db;
    --stale:#b3261e; --stale-soft:#fdecea; --hold:#9b9a97;
    --shadow:0 1px 2px rgba(15,15,15,.04),0 2px 6px rgba(15,15,15,.04); --radius:10px; }
  *{box-sizing:border-box} body{margin:0;padding:48px 40px 64px;background:var(--bg);color:var(--ink);
    font-family:"Inter","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;line-height:1.65;font-size:14px}
  .page{max-width:1080px;margin:0 auto} h1{font-size:26px;margin:0 0 8px;font-weight:700}
  h2{font-size:16px;font-weight:700;margin:36px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line-soft)}
  .meta{color:var(--sub);font-size:13px;margin-bottom:20px;background:var(--card);
    border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px 16px}
  table{border-collapse:separate;border-spacing:0;width:100%;background:var(--card);font-size:13px;
    border:1px solid var(--line-soft);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
  th,td{border:none;border-bottom:1px solid var(--line-soft);padding:9px 12px;text-align:left;vertical-align:top}
  tr:last-child td{border-bottom:none}
  th{background:#f7f7f5;font-weight:600;font-size:12px;color:var(--sub);white-space:nowrap}
  tr:hover td{background:#fafaf9}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
  .chip{display:inline-block;font-size:11.5px;font-weight:600;line-height:1.6;padding:1px 9px;
    border-radius:999px;background:var(--todo-soft);color:var(--todo);white-space:nowrap}
  .chip.ok{background:var(--done-soft);color:var(--done)}
  .chip.stale{background:var(--stale-soft);color:var(--stale)}
  .chip.na{background:var(--todo-soft);color:var(--hold)}
  .chip.dirty{background:var(--warn-soft);color:var(--warn)}
  tr.stale-row td{background:var(--stale-soft)}
  .note{color:var(--sub);font-size:12px;margin-top:24px}
  .summary{display:flex;gap:12px;margin:0 0 20px;flex-wrap:wrap}
  .stat{background:var(--card);border:1px solid var(--line-soft);border-radius:var(--radius);
    box-shadow:var(--shadow);padding:10px 16px;font-size:13px}
  .stat strong{font-size:20px;display:block;line-height:1.3}
"""


def render(rows):
    today = date.today().isoformat()
    groups = {}
    for r in rows:
        groups.setdefault(r["phase"], []).append(r)

    n_target = sum(1 for r in rows if r["checked"] in ("未確認", "済"))
    n_ok = sum(1 for r in rows if r["checked"] == "済")
    stale_count = 0

    body = []
    for phase, items in groups.items():
        body.append(f"<h2>{html.escape(phase)}</h2>")
        body.append("<table><tr><th>成果物</th><th>更新日</th><th>人間確認</th>"
                    "<th>OK日付</th><th>確認者</th><th>備考</th></tr>")
        for r in items:
            p = DOCS / r["path"]
            upd, state = updated_date(p)
            is_stale = bool(r["checked"] == "済" and r["ok_date"] and upd and upd > r["ok_date"])
            if is_stale:
                stale_count += 1
            if r["checked"] == "済":
                chip = '<span class="chip stale">鮮度切れ</span>' if is_stale else '<span class="chip ok">確認済み</span>'
            elif r["checked"] == "未確認":
                chip = '<span class="chip">未確認</span>'
            else:
                chip = '<span class="chip na">対象外</span>'
            upd_html = html.escape(upd or "—")
            if state == "未コミット":
                upd_html += ' <span class="chip dirty">未コミット</span>'
            elif state == "欠落":
                upd_html = '<span class="chip stale">ファイル欠落</span>'
            # 台帳のパスは docs/ 相対。本HTMLは docs/10-management/ に置かれるため1つ上がる
            link = f'<a href="../{html.escape(r["path"])}">{html.escape(r["name"])}</a>' if p.is_file() else html.escape(r["name"])
            row_cls = ' class="stale-row"' if is_stale else ""
            body.append(
                f"<tr{row_cls}><td>{link}<br><span style='color:var(--sub);font-size:11px'>{html.escape(r['path'])}</span></td>"
                f"<td>{upd_html}</td><td>{chip}</td>"
                f"<td>{html.escape(r['ok_date'] or '—')}</td><td>{html.escape(r['checker'] or '—')}</td>"
                f"<td>{html.escape(r['note'])}</td></tr>")
        body.append("</table>")

    summary = (f'<div class="summary">'
               f'<div class="stat"><strong>{n_target}</strong>確認対象</div>'
               f'<div class="stat"><strong>{n_ok}</strong>確認済み</div>'
               f'<div class="stat"><strong>{n_target - n_ok}</strong>未確認</div>'
               f'<div class="stat"><strong>{stale_count}</strong>鮮度切れ</div></div>')

    return f"""<!DOCTYPE html>
<!-- tools/gen_deliverables_index.py により docs/10-management/deliverables-ledger.md から生成。直接編集しない -->
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>成果物一覧 — 汎用ECモジュール</title><style>{CSS}</style></head>
<body><div class="page">
<h1>成果物一覧</h1>
<div class="meta">生成日: {today} ／ 正本: docs/10-management/deliverables-ledger.md（本HTMLは一方向生成ビュー） ／
「確認済み」なのに更新日がOK日付より新しい行は<strong>鮮度切れ</strong>として強調表示されます。</div>
{summary}
{''.join(body)}
<div class="note">確認ステータスの更新は docs/10-management/deliverables-ledger.md を編集し、
<code>python3 tools/gen_deliverables_index.py</code> で再生成してください。</div>
</div></body></html>
"""


def main():
    if not LEDGER.is_file():
        sys.exit("台帳が見つからない: %s" % LEDGER)
    OUT.write_text(render(parse_ledger()), encoding="utf-8")
    print("生成: %s" % OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
