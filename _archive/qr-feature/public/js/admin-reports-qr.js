function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadReport() {
  const tbody = document.getElementById('report-body');
  const table = document.querySelector('table.admin-table');
  const emptyState = document.getElementById('report-empty');
  try {
    const res = await fetch('/api/admin/reports/qr');
    const data = await res.json();
    tbody.innerHTML = '';

    if (data.report.length === 0) {
      table.hidden = true;
      emptyState.hidden = false;
      return;
    }
    table.hidden = false;
    emptyState.hidden = true;

    for (const row of data.report) {
      const tr = document.createElement('tr');
      const cvrText = row.cvr === null || row.cvr === undefined ? '-' : `${(row.cvr * 100).toFixed(1)}%`;
      tr.innerHTML = `
        <td>${escapeHtml(row.qr_id)}</td>
        <td>${escapeHtml(row.qr_source_name)}</td>
        <td>${escapeHtml(row.source_type)}</td>
        <td>${row.access_count}</td>
        <td>${row.order_count}</td>
        <td>${cvrText}</td>
        <td>¥${Number(row.total_amount).toLocaleString('ja-JP')}</td>
        <td>¥${Number(row.average_amount).toLocaleString('ja-JP')}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (err) {
    table.hidden = true;
    emptyState.hidden = false;
  }
}

loadReport();
