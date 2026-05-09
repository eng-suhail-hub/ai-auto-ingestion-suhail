<?php
/**
 * Famelo v8 — CORS Proxy (PHP, compatible with PHP 7.2+)
 * URL: http://localhost/ai-ingestion/proxy.php
 *
 * Test it's working: http://localhost/ai-ingestion/proxy.php?test=1
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, HTTP-Referer, X-Title');
header('Content-Type: application/json; charset=utf-8');

// Silence PHP notices/warnings which can break JSON
error_reporting(0);
ini_set('display_errors', 0);


// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Quick test endpoint ──────────────────────────────────────────────────────
if (isset($_GET['test'])) {
    $curlOk = function_exists('curl_version');
    echo json_encode([
        'proxy' => 'ok',
        'php' => PHP_VERSION,
        'curl' => $curlOk ? curl_version()['version'] : 'NOT INSTALLED',
        'curlOk' => $curlOk,
    ]);
    exit;
}

// ── Validate target URL ──────────────────────────────────────────────────────
$targetUrl = isset($_GET['url']) ? trim($_GET['url']) : '';
if (empty($targetUrl)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing ?url= parameter']);
    exit;
}

// Security: only allow known AI API hosts
$allowedHosts = [
    'text.pollinations.ai',
    'gen.pollinations.ai',        // new Pollinations API endpoint
    'openrouter.ai',
    'generativelanguage.googleapis.com',
    'api.groq.com',
    'router.huggingface.co',          // HF Inference Router (new serverless endpoint)
    'api.together.xyz',
    'api.together.ai',            // alternate Together AI domain
    'api.mistral.ai',
];

$parsed = parse_url($targetUrl);
$host = isset($parsed['host']) ? $parsed['host'] : '';
$allowed = false;
foreach ($allowedHosts as $h) {
    if ($host === $h || (strlen($host) > strlen($h) && substr($host, -(strlen($h) + 1)) === '.' . $h)) {
        $allowed = true;
        break;
    }
}
if (!$allowed) {
    http_response_code(403);
    echo json_encode(['error' => 'Host not allowed: ' . $host]);
    exit;
}

// ── Ensure cURL is available ─────────────────────────────────────────────────
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'cURL is not enabled in PHP. Enable it in php.ini (extension=curl)']);
    exit;
}

// ── Build forward headers ────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');
$forwardHeaders = [];

if (function_exists('getallheaders')) {
    $incoming = getallheaders();
} else {
    // Fallback for servers where getallheaders() isn't available
    $incoming = [];
    foreach ($_SERVER as $k => $v) {
        if (substr($k, 0, 5) === 'HTTP_') {
            $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($k, 5)))));
            $incoming[$name] = $v;
        }
    }
    if (isset($_SERVER['CONTENT_TYPE']))
        $incoming['Content-Type'] = $_SERVER['CONTENT_TYPE'];
    if (isset($_SERVER['CONTENT_LENGTH']))
        $incoming['Content-Length'] = $_SERVER['CONTENT_LENGTH'];
}

$skip = ['host', 'connection', 'transfer-encoding', 'content-length'];
foreach ($incoming as $name => $value) {
    if (in_array(strtolower($name), $skip))
        continue;
    $forwardHeaders[] = $name . ': ' . $value;
}

// ── Execute cURL request ─────────────────────────────────────────────────────
$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_HTTPHEADER => $forwardHeaders,
    CURLOPT_SSL_VERIFYPEER => false,   // Allow self-signed certs in dev
    CURLOPT_USERAGENT => 'Famelo-v8-Proxy/1.0',
    CURLOPT_ENCODING => '',      // Accept any encoding (gzip etc.)
]);

if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
} elseif ($method !== 'GET') {
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'Proxy cURL error: ' . $curlError]);
    exit;
}

http_response_code($httpCode ?: 500);
echo $response;
