<?php
namespace Suhail\Core\Providers;

use Suhail\Core\AIProvider;
use Exception;

class GeminiProvider extends AIProvider {
    public function process($prompt, $structure, $imagePath) {
        if (empty($this->apiKey)) throw new Exception("Gemini API Key is required.");

        $mime = 'image/jpeg';
        $ext = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
        if ($ext === 'png') $mime = 'image/png';
        if ($ext === 'webp') $mime = 'image/webp';

        $b64Data = base64_encode(file_get_contents($imagePath));

        $body = [
            'contents' => [[
                'parts' => [
                    ['text' => $prompt . "\n\nReturn ONLY JSON:\n" . $structure],
                    ['inline_data' => ['mime_type' => $mime, 'data' => $b64Data]]
                ]
            ]],
            'generationConfig' => ['temperature' => 0.4, 'maxOutputTokens' => 2048]
        ];

        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}";
        $res = $this->curlPost($url, ['Content-Type: application/json'], $body);

        if ($res['status'] >= 400) {
            $err = json_decode($res['body'], true);
            $msg = $err['error']['message'] ?? $res['body'];
            throw new Exception("Gemini Error ({$res['status']}): $msg");
        }

        $data = json_decode($res['body'], true);
        $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if (!$text) throw new Exception("Gemini returned empty response.");

        return $this->extractJSON($text);
    }
}
