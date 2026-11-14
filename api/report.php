<?php
/* System-generated citizen feedback report (KDSP II evidence code 007_DL7_1.4.1).
   Usage: api/report.php?key=REPORT_KEY[&from=2026-07-01&to=2027-06-30][&format=csv]
   Personal details are left out of the report. */
declare(strict_types=1);
require __DIR__ . '/settings.php';
if (!hash_equals(REPORT_KEY, (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('Forbidden'); }
$db = new PDO('sqlite:' . DB_PATH); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$from = preg_match('/^\d{4}-\d\d-\d\d$/', $_GET['from'] ?? '') ? $_GET['from'] : '2000-01-01';
$to = preg_match('/^\d{4}-\d\d-\d\d$/', $_GET['to'] ?? '') ? $_GET['to'] : '2999-12-31';
$st = $db->prepare("SELECT reference, kind, category, project_id, project, department, ward, message, received_at, due_at, status, response, responded_at
                    FROM feedback WHERE substr(received_at,1,10) BETWEEN ? AND ? ORDER BY received_at");
$st->execute([$from, $to]); $rows = $st->fetchAll(PDO::FETCH_ASSOC);
if (($_GET['format'] ?? '') === 'csv') {
  header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="Garissa_citizen_feedback_report.csv"');
  $o = fopen('php://output', 'w'); fputcsv($o, array_keys($rows[0] ?? ['reference' => '']));
  foreach ($rows as $r) fputcsv($o, $r); exit;
}
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
echo "<!DOCTYPE html><meta charset='utf-8'><title>Citizen feedback report</title><style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f4ebe0}</style>";
echo "<h1>County Government of Garissa: citizen feedback report</h1><p>Period {$h($from)} to {$h($to)}. Generated " . date('d M Y H:i') . ". Total received: " . count($rows) . ".</p><table><tr>";
foreach (['Reference', 'Type', 'Category', 'Project', 'Department', 'Ward', 'Message', 'Received', 'Due', 'Status', 'County response', 'Responded'] as $c) echo "<th>$c</th>";
echo '</tr>';
foreach ($rows as $r) echo "<tr><td>{$h($r['reference'])}</td><td>{$h($r['kind'])}</td><td>{$h($r['category'])}</td><td>{$h($r['project'])}</td><td>{$h($r['department'])}</td><td>{$h($r['ward'])}</td><td>{$h($r['message'])}</td><td>{$h(substr($r['received_at'], 0, 10))}</td><td>{$h(substr($r['due_at'], 0, 10))}</td><td>{$h($r['status'])}</td><td>{$h($r['response'])}</td><td>{$h(substr((string)$r['responded_at'], 0, 10))}</td></tr>";
echo '</table>';
