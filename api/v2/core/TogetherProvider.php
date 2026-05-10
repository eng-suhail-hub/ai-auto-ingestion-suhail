<?php
namespace Suhail\Core\Providers;

use Suhail\Core\AIProvider;
use Exception;

class TogetherProvider extends AIProvider {
    public function process($prompt, $structure, $imagePath) {
        if (empty($this->apiKey)) throw new Exception("Together AI API Key is required.");
        $imageB64 = $this->getBase64Image($imagePath);

        $body = [
            'model' => $this->model,
            'messages' => [[
                'role' => 'user',
                'content' => [
                    ['type' => 'text', 'text' => $prompt . "\n\nReturn ONLY JSON:\n" . $structure],
                    ['type' => 'image_url', 'image_url' => ['url' => $imageB64]]
                ]
            ]],
            'max_tokens' => 2000,
            'temperature' => 0.2
        ];

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json'
        ];
        $res = $this->curlPost('https://api.together.xyz/v1/chat/completions', $headers, $body);

        if ($res['status'] >= 400) {
            $err = json_decode($res['body'], true);
            $msg = $err['error']['message'] ?? $err['error'] ?? $res['body'];
            throw new Exception("Together AI Error ({$res['status']}): $msg");
        }
        $data = json_decode($res['body'], true);
        return $this->extractJSON($data['choices'][0]['message']['content'] ?? '');
    }
}
