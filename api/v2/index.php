<?php
/**
 * Suhail Professional Backend Entry Point
 */

require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/AIProvider.php';
require_once __DIR__ . '/core/GeminiProvider.php';
require_once __DIR__ . '/core/PollinationsProvider.php';
require_once __DIR__ . '/core/OpenRouterProvider.php';
require_once __DIR__ . '/core/GroqProvider.php';
require_once __DIR__ . '/core/MistralProvider.php';
require_once __DIR__ . '/core/TogetherProvider.php';
require_once __DIR__ . '/core/HuggingFaceProvider.php';

use Suhail\Core\Database;
use Suhail\Core\Providers\GeminiProvider;
use Suhail\Core\Providers\PollinationsProvider;
use Suhail\Core\Providers\OpenRouterProvider;
use Suhail\Core\Providers\GroqProvider;
use Suhail\Core\Providers\MistralProvider;
use Suhail\Core\Providers\TogetherProvider;
use Suhail\Core\Providers\HuggingFaceProvider;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Ensure directories exist
$uploadDir = __DIR__ . '/../../uploads/history/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
$dataDir = __DIR__ . '/data/';
if (!is_dir($dataDir)) mkdir($dataDir, 0777, true);

$input = json_decode(file_get_contents('php://input'), true);
$action = $_GET['action'] ?? $input['action'] ?? 'process';

$db = Database::getInstance();

try {
    switch ($action) {
        case 'get_workflows':
            $workflows = $db->fetchAll("SELECT * FROM workflows ORDER BY created_at DESC");
            echo json_encode(['success' => true, 'workflows' => $workflows]);
            break;

        case 'save_workflow':
            $stmt = $db->getConnection()->prepare("INSERT INTO workflows (name, prompt, structure, language) VALUES (?, ?, ?, ?)");
            $stmt->execute([$input['name'], $input['prompt'], $input['structure'], $input['language']]);
            echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
            break;

        case 'get_history':
            $page = (int)($input['page'] ?? 1);
            $limit = 20;
            $offset = ($page - 1) * $limit;
            $results = $db->fetchAll("SELECT r.*, b.provider, b.model FROM results r JOIN batches b ON r.batch_id = b.id ORDER BY r.created_at DESC LIMIT $limit OFFSET $offset");
            echo json_encode(['success' => true, 'results' => $results]);
            break;

        case 'create_batch':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception("POST required");
            $stmt = $db->getConnection()->prepare("INSERT INTO batches (workflow_id, provider, model, total_files, status) VALUES (?, ?, ?, ?, 'processing')");
            $stmt->execute([$input['workflow_id'] ?? 0, $input['provider'], $input['model'], $input['total_files'] ?? 1]);
            echo json_encode(['success' => true, 'batch_id' => $db->lastInsertId()]);
            break;

        case 'process':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception("POST required");

            // 1. Get batch
            $batchId = $input['batch_id'] ?? null;
            if (!$batchId) {
                // Fallback for direct calls
                $stmt = $db->getConnection()->prepare("INSERT INTO batches (workflow_id, provider, model, total_files, status) VALUES (?, ?, ?, ?, 'processing')");
                $stmt->execute([$input['workflow_id'] ?? 0, $input['provider'], $input['model'], $input['total_files'] ?? 1]);
                $batchId = $db->lastInsertId();
            }

            // 2. Save Image
            $imageData = $input['image']; // base64
            if (strpos($imageData, 'data:') === 0) {
                $parts = explode(',', $imageData);
                $mimeType = explode(';', explode(':', $parts[0])[1])[0];
                $ext = explode('/', $mimeType)[1];
                $imgContent = base64_decode($parts[1]);
            } else {
                $ext = 'jpg';
                $imgContent = base64_decode($imageData);
            }
            $filename = uniqid('img_') . '.' . $ext;
            $path = __DIR__ . '/../../uploads/history/' . $filename;
            file_put_contents($path, $imgContent);

            // 3. Process with AI
            $providerName = $input['provider'];
            $apiKey = $input['apiKey'];
            $model = $input['model'];
            $prompt = $input['prompt'];
            $structure = $input['structure'];

            $provider = null;
            switch ($providerName) {
                case 'gemini':       $provider = new GeminiProvider($apiKey, $model); break;
                case 'pollinations': $provider = new PollinationsProvider($apiKey, $model); break;
                case 'openrouter':   $provider = new OpenRouterProvider($apiKey, $model); break;
                case 'groq':         $provider = new GroqProvider($apiKey, $model); break;
                case 'mistral':      $provider = new MistralProvider($apiKey, $model); break;
                case 'together':     $provider = new TogetherProvider($apiKey, $model); break;
                case 'huggingface':  $provider = new HuggingFaceProvider($apiKey, $model); break;
                default: throw new Exception("Provider $providerName not found.");
            }

            $result = $provider->process($prompt, $structure, $path);

            // 4. Save Result
            $stmt = $db->getConnection()->prepare("INSERT INTO results (batch_id, original_filename, stored_filename, result_json, status) VALUES (?, ?, ?, ?, 'done')");
            $stmt->execute([$batchId, $input['filename'] ?? 'unknown', $filename, json_encode($result, JSON_UNESCAPED_UNICODE)]);

            echo json_encode(['success' => true, 'result' => $result, 'batch_id' => $batchId]);
            break;

        case 'save_settings':
            $stmt = $db->getConnection()->prepare("INSERT OR REPLACE INTO settings (key_name, key_value) VALUES (?, ?)");
            foreach ($input['settings'] as $key => $val) {
                $stmt->execute([$key, $val]);
            }
            echo json_encode(['success' => true]);
            break;

        case 'get_settings':
            $settings = $db->fetchAll("SELECT * FROM settings");
            $formatted = [];
            foreach ($settings as $s) { $formatted[$s['key_name']] = $s['key_value']; }
            echo json_encode(['success' => true, 'settings' => $formatted]);
            break;

        default:
            throw new Exception("Unknown action: $action");
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
