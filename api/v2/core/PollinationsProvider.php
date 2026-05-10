<?php
namespace Suhail\Core\Providers;

use Suhail\Core\AIProvider;
use Exception;

class PollinationsProvider extends AIProvider {
    public function process($prompt, $structure, $imagePath) {
        $imageB64 = $this->getBase64Image($imagePath);
        $body = [
            'model' => $this->model ?: 'openai',
            'messages' => [[
                'role' => 'user',
                'content' => [
                    ['type' => 'text', 'text' => $prompt . "\n\nReturn ONLY JSON:\n" . $structure],
                    ['type' => 'image_url', 'image_url' => ['url' => $imageB64]]
                ]
            ]],
            'max_tokens' => 2000,
            'temperature' => 0.3
        ];

        $headers = ['Content-Type: application/json'];
        if (!empty($this->apiKey)) $headers[] = 'Authorization: Bearer ' . $this->apiKey;

        $res = $this->curlPost('https://gen.pollinations.ai/v1/chat/completions', $headers, $body);

        if ($res['status'] >= 400) {
            $err = json_decode($res['body'], true);
            $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
            throw new Exception("Pollinations Error ({$res['status']}): $msg");
        }
        $data = json_decode($res['body'], true);
        return $this->extractJSON($data['choices'][0]['message']['content'] ?? '');
    }
}
