<?php
/* Garissa County PIM Dashboard - feedback endpoint for the County server.
   Stores each message in the database, emails the feedback desk and sends the citizen an acknowledgement.
   Enable by setting FEEDBACK_MODE: 'php' in js/config.js. Requires PHP 8+ with PDO SQLite and a working mail(). */
declare(strict_types=1);
require __DIR__ . '/settings.php';
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit(json_encode(['success' => false, 'message' => 'POST only'])); }
$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) { http_response_code(400); exit(json_encode(['success' => false, 'message' => 'Invalid request'])); }
$g = fn(string $k, int $max = 300): string => mb_substr(trim(str_replace(["\r", "\0"], '', (string)($in[$k] ?? ''))), 0, $max);
$message = $g('Message', 5000); $ref = $g('Reference', 40); $email = $g('email', 200);
if (mb_strlen($message) < 10 || !preg_match('/^GSA-(FB|GRM)-\d{8}-[A-Z0-9]{4}$/', $ref)) { http_response_code(422); exit(json_encode(['success' => false, 'message' => 'Message too short or bad reference'])); }
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) { http_response_code(422); exit(json_encode(['success' => false, 'message' => 'Invalid email'])); }

$db = new PDO('sqlite:' . DB_PATH); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec(file_get_contents(__DIR__ . '/schema.sql'));
$now = new DateTimeImmutable('now', new DateTimeZone('Africa/Nairobi'));
$anon = $g('Anonymous') === 'Yes' ? 1 : 0;
$st = $db->prepare('INSERT INTO feedback (reference, kind, category, project_id, project, department, ward, message, anonymous, name, email, phone, language, received_at, due_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
$st->execute([$ref, $g('Type', 40), $g('Category', 80), $g('Project ID', 60), $g('Project'), $g('Department', 120), $g('Ward', 120), $message, $anon,
  $anon ? null : $g('Name', 120), $anon ? null : $email, $anon ? null : ($g('Phone', 40) ?: $g('Contact', 120)), $g('Language', 5),
  $now->format('c'), $now->modify('+' . RESPONSE_DAYS . ' days')->format('c')]);

$headers = "From: " . FROM_NAME . " <" . FROM_EMAIL . ">\r\nContent-Type: text/plain; charset=UTF-8\r\n";
$body = "Reference: $ref\nType: {$g('Type', 40)}\nCategory: {$g('Category', 80)}\nProject: {$g('Project')} ({$g('Project ID', 60)})\nDepartment: {$g('Department', 120)}\nWard: {$g('Ward', 120)}\n"
      . "Received: {$now->format('d M Y H:i')} EAT\nRespond by: {$now->modify('+' . RESPONSE_DAYS . ' days')->format('d M Y')}\n\n$message\n\n"
      . ($anon ? "Sent anonymously." : "From: {$g('Name', 120)} | $email | {$g('Phone', 40)}{$g('Contact', 120)}");
@mail(FEEDBACK_EMAIL, "[$ref] {$g('Type', 40)} | " . ($g('Department', 120) ?: 'General'), $body, $headers . ($email && !$anon ? "Reply-To: $email\r\n" : ''));
if ($email !== '' && !$anon) {
  $ack = ['sw' => "Ndugu Mwananchi,\n\nAsante kwa kuwasiliana na Serikali ya Kaunti ya Garissa. Maoni yako yamepokelewa kwa namba ya kumbukumbu $ref.\n\nIdara husika inayashughulikia na utapokea jibu ndani ya siku " . RESPONSE_DAYS . ".\n\nSerikali ya Kaunti ya Garissa",
          'so' => "Mudane/Marwo,\n\nWaad ku mahadsan tahay la xiriirka Dowladda Ismaamulka Garissa. Ra'yigaaga waa la helay, lambarka tixraacuna waa $ref.\n\nWaxaad jawaab heli doontaa " . RESPONSE_DAYS . " maalmood gudahood.\n\nDowladda Ismaamulka Garissa"];
  $text = $ack[$g('Language', 5)] ?? "Dear Sir/Madam,\n\nThank you for contacting the County Government of Garissa. Your feedback has been received under reference $ref.\n\nThe responsible department is reviewing it and you will receive a response within " . RESPONSE_DAYS . " days. Please quote the reference number in any further correspondence.\n\nCounty Government of Garissa\nPublic Investment Management Projects Dashboard";
  @mail($email, "Feedback received - reference $ref", $text, $headers);
}
echo json_encode(['success' => true, 'reference' => $ref]);
