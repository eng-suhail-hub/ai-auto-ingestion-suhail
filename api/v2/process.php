<?php
/**
 * Suhail v2 Backend API - Unified Processor (Single Image)
 * Robust version with enhanced error handling and JSON extraction.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Increase limits for processing images
ini_set('memory_limit', '512M');
set_time_limit(180);

/**
 * Extracts JSON from AI response with high resilience.
 */
function extractJSON($text) {
    if (empty($text)) return null;

    // 1. Try to find a JSON block with triple backticks (```json ... ``` or ``` ... ```)
    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $matches)) {
        $jsonStr = trim($matches[1]);
        $decoded = json_decode($jsonStr, true);
        if ($decoded !== null) return $decoded;
        // If block content isn't valid JSON on its own, fall through to brace matching on the block content
        $text = $jsonStr;
    }

    // 2. Fallback: Search for the outermost JSON structure (Object or Array)
    $firstBrace = strpos($text, '{');
    $firstBracket = strpos($text, '[');

    $start = false;
    $endChar = '';

    if ($firstBrace !== false && ($firstBracket === false || $firstBrace < $firstBracket)) {
        $start = $firstBrace;
        $endChar = '}';
    } elseif ($firstBracket !== false) {
        $start = $firstBracket;
        $endChar = ']';
    }

    if ($start !== false) {
        $end = strrpos($text, $endChar);
        if ($end !== false && $end > $start) {
            $jsonStr = substr($text, $start, $end - $start + 1);
            $decoded = json_decode($jsonStr, true);
            if ($decoded !== null) return $decoded;
        }
    }

    // 3. Last ditch: try decoding the whole trimmed string
    return json_decode(trim($text), true);
}

/**
 * Perform a CURL POST request with common options
 */
function curlPost($url, $headers, $body) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($body) ? json_encode($body) : $body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        throw new Exception("Network Error: $error");
    }

    return ['status' => $status, 'body' => $res];
}

function callPollinations($payload, $image) {
    $apiKey = $payload['apiKey'] ?? '';
    $model = $payload['model'] ?: 'openai';
    $seed = $payload['options']['seed'] ?? null;

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2000,
        'temperature' => 0.3
    ];
    if ($seed) $body['seed'] = (int)$seed;

    $headers = ['Content-Type: application/json'];
    if (!empty($apiKey)) $headers[] = 'Authorization: Bearer ' . $apiKey;

    $res = curlPost('https://gen.pollinations.ai/v1/chat/completions', $headers, $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
        throw new Exception("Pollinations Error ({$res['status']}): $msg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callOpenRouter($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("OpenRouter API Key is required.");
    $model = $payload['model'];

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2000,
        'temperature' => 0.3
    ];

    $headers = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
        'HTTP-Referer: https://famelo.ai',
        'X-Title: Famelo v8'
    ];

    $res = curlPost('https://openrouter.ai/api/v1/chat/completions', $headers, $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
        throw new Exception("OpenRouter Error ({$res['status']}): $msg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callGemini($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("Gemini API Key is required.");

    $model = $payload['model'];

    // Better MIME detection
    $mime = 'image/jpeg';
    if (preg_match('/^data:(image\/[a-z]+);base64,/', $image, $m)) {
        $mime = $m[1];
    }

    $parts = explode(',', $image);
    $b64Data = isset($parts[1]) ? $parts[1] : $parts[0];

    $body = [
        'contents' => [[
            'parts' => [
                ['text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['inline_data' => ['mime_type' => $mime, 'data' => $b64Data]]
            ]
        ]],
        'generationConfig' => [
            'temperature' => 0.4,
            'maxOutputTokens' => 2048,
        ]
    ];

    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
    $res = curlPost($url, ['Content-Type: application/json'], $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        // Gemini errors are often in an array
        $msg = $err['error']['message'] ?? (isset($err[0]['error']['message']) ? $err[0]['error']['message'] : $res['body']);
        throw new Exception("Gemini Error ({$res['status']}): $msg");
    }

    $data = json_decode($res['body'], true);

    if (!isset($data['candidates'][0]['content']['parts'][0]['text'])) {
        if (isset($data['promptFeedback']['blockReason'])) {
            throw new Exception("Gemini Blocked Content: " . $data['promptFeedback']['blockReason']);
        }
        throw new Exception("Gemini returned unexpected response format.");
    }

    return extractJSON($data['candidates'][0]['content']['parts'][0]['text']);
}

function callGroq($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("Groq API Key is required.");
    $model = $payload['model'];

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2000,
        'temperature' => 0.2
    ];

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ];
    $res = curlPost('https://api.groq.com/openai/v1/chat/completions', $headers, $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
        throw new Exception("Groq Error ({$res['status']}): $msg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callMistral($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("Mistral API Key is required.");
    $model = $payload['model'];

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2000,
        'temperature' => 0.2
    ];

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ];
    $res = curlPost('https://api.mistral.ai/v1/chat/completions', $headers, $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
        throw new Exception("Mistral Error ({$res['status']}): $msg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callTogether($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("Together AI API Key is required.");
    $model = $payload['model'];

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2000,
        'temperature' => 0.2
    ];

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ];
    $res = curlPost('https://api.together.xyz/v1/chat/completions', $headers, $body);

    if ($res['status'] >= 400) {
        $err = json_decode($res['body'], true);
        $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
        throw new Exception("Together AI Error ({$res['status']}): $msg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callHuggingFace($payload, $image) {
    $apiKey = $payload['apiKey'];
    if (empty($apiKey)) throw new Exception("HuggingFace API Key is required.");
    $model = $payload['model'];

    $body = [
        'model' => $model,
        'messages' => [[
            'role' => 'user',
            'content' => [
                ['type' => 'text', 'text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['type' => 'image_url', 'image_url' => ['url' => $image]]
            ]
        ]],
        'max_tokens' => 2048
    ];

    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ];
    $res = curlPost("https://api-inference.huggingface.co/models/{$model}/v1/chat/completions", $headers, $body);

    if ($res['status'] >= 400) {
        $errorData = json_decode($res['body'], true);
        $errorMsg = $errorData['error'] ?? $res['body'];
        if (is_array($errorMsg)) $errorMsg = json_encode($errorMsg);

        if (strpos($errorMsg, 'loading') !== false) {
            throw new Exception("HuggingFace Model is currently loading. Try again in a few seconds.");
        }
        throw new Exception("HuggingFace Error ({$res['status']}): $errorMsg");
    }
    $data = json_decode($res['body'], true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception("Method not allowed. Use POST.");
    }

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!$input) {
        throw new Exception("Invalid JSON request body.");
    }

    $provider = $input['provider'] ?? '';
    $image = $input['image'] ?? '';

    if (empty($image)) throw new Exception("No image data provided.");
    if (empty($provider)) throw new Exception("No provider specified.");

    $result = null;
    switch ($provider) {
        case 'pollinations': $result = callPollinations($input, $image); break;
        case 'openrouter':   $result = callOpenRouter($input, $image); break;
        case 'gemini':       $result = callGemini($input, $image); break;
        case 'groq':         $result = callGroq($input, $image); break;
        case 'mistral':      $result = callMistral($input, $image); break;
        case 'together':     $result = callTogether($input, $image); break;
        case 'huggingface':  $result = callHuggingFace($input, $image); break;
        default: throw new Exception("Provider '$provider' is not supported.");
    }

    if ($result === null) {
        throw new Exception("The AI failed to return valid JSON. This may happen if the model is busy or the prompt was too complex.");
    }

    echo json_encode(['success' => true, 'result' => $result]);

} catch (Exception $e) {
    // Return 200 with success:false so the frontend can handle the error message gracefully
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
