<?php
/**
 * Suhail v2 Backend API - Unified Processor (Single Image)
 */

header('Content-Type: application/json');

/**
 * Extracts JSON from AI response.
 */
function extractJSON($text) {
    if (empty($text)) return null;

    if (preg_match('/```json\s*([\s\S]*?)```/', $text, $matches)) {
        $jsonStr = trim($matches[1]);
    } elseif (preg_match('/```\s*([\s\S]*?)```/', $text, $matches)) {
        $jsonStr = trim($matches[1]);
    } else {
        $jsonStr = trim($text);
    }

    $first = strpos($jsonStr, '{');
    $firstBracket = strpos($jsonStr, '[');
    if ($first === false && $firstBracket === false) return null;

    if ($first === false || ($firstBracket !== false && $firstBracket < $first)) {
        $first = $firstBracket;
        $last = strrpos($jsonStr, ']');
    } else {
        $last = strrpos($jsonStr, '}');
    }

    if ($last === false) return null;

    $jsonStr = substr($jsonStr, $first, $last - $first + 1);
    return json_decode($jsonStr, true);
}

function callPollinations($payload, $image) {
    $apiKey = $payload['apiKey'];
    $model = $payload['model'] ?: 'openai';
    $seed = $payload['seed'] ?? null;

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

    $ch = curl_init('https://gen.pollinations.ai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $headers = ['Content-Type: application/json'];
    if ($apiKey) $headers[] = 'Authorization: Bearer ' . $apiKey;

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("Pollinations Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callOpenRouter($payload, $image) {
    $apiKey = $payload['apiKey'];
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
        'HTTP-Referer: https://famelo.ai',
        'X-Title: Famelo v8'
    ];
    if ($apiKey) $headers[] = 'Authorization: Bearer ' . $apiKey;

    $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("OpenRouter Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callGemini($payload, $image) {
    $apiKey = $payload['apiKey'];
    $model = $payload['model'];
    $b64Data = explode(',', $image)[1];

    $body = [
        'contents' => [[
            'parts' => [
                ['text' => $payload['prompt'] . "\n\nReturn ONLY JSON:\n" . $payload['structure']],
                ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => $b64Data]]
            ]
        ]]
    ];

    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("Gemini Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['candidates'][0]['content']['parts'][0]['text'] ?? '');
}

function callGroq($payload, $image) {
    $apiKey = $payload['apiKey'];
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

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("Groq Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callMistral($payload, $image) {
    $apiKey = $payload['apiKey'];
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

    $ch = curl_init('https://api.mistral.ai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("Mistral Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callTogether($payload, $image) {
    $apiKey = $payload['apiKey'];
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

    $ch = curl_init('https://api.together.xyz/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) throw new Exception("Together Error ($status): $res");
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

function callHuggingFace($payload, $image) {
    $apiKey = $payload['apiKey'];
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
        'max_tokens' => 2000
    ];

    $ch = curl_init("https://api-inference.huggingface.co/models/{$model}/v1/chat/completions");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status !== 200) {
        $errorData = json_decode($res, true);
        $errorMsg = $errorData['error'] ?? $res;
        if (strpos($errorMsg, 'loading') !== false) {
            throw new Exception("HuggingFace Error: Model is loading. Please wait.");
        }
        throw new Exception("HuggingFace Error ($status): $errorMsg");
    }
    $data = json_decode($res, true);
    return extractJSON($data['choices'][0]['message']['content'] ?? '');
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new Exception("Invalid request method.");
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) throw new Exception("Invalid JSON input.");

    $provider = $input['provider'] ?? '';
    $image = $input['image'] ?? '';

    if (empty($image) || empty($provider)) throw new Exception("Missing image or provider.");

    $result = null;
    switch ($provider) {
        case 'pollinations': $result = callPollinations($input, $image); break;
        case 'openrouter':   $result = callOpenRouter($input, $image); break;
        case 'gemini':       $result = callGemini($input, $image); break;
        case 'groq':         $result = callGroq($input, $image); break;
        case 'mistral':      $result = callMistral($input, $image); break;
        case 'together':     $result = callTogether($input, $image); break;
        case 'huggingface':  $result = callHuggingFace($input, $image); break;
        default: throw new Exception("Unknown provider: $provider");
    }

    if (!$result) throw new Exception("AI failed to return valid JSON structure.");
    echo json_encode(['success' => true, 'result' => $result]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
