async function loadSummary() {
  const container = document.getElementById('summary');
  try {
    const res = await fetch('/api/admin/summary');
    const data = await res.json();
    const yen = (n) => `¥${(n || 0).toLocaleString('ja-JP')}`;
    container.innerHTML = `
      <div class="admin-summary-card"><div class="label">本日売上</div><div class="value">${yen(data.today_total_amount)}</div></div>
      <div class="admin-summary-card"><div class="label">本日注文数</div><div class="value">${data.today_order_count}</div></div>
    `;
  } catch (err) {
    container.textContent = 'サマリーの取得に失敗しました。';
  }
}

loadSummary();
