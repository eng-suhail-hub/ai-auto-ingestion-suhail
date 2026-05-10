<?php
namespace Suhail\Core\Providers;

use Suhail\Core\AIProvider;
use Exception;

class HuggingFaceProvider extends AIProvider {
    public function process($prompt, $structure, $imagePath) {
        if (empty($this->apiKey)) throw new Exception("HuggingFace API Key is required.");
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
            'max_tokens' => 2048
        ];

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json'
        ];
        $res = $this->curlPost("https://api-inference.huggingface.co/models/{$this->model}/v1/chat/completions", $headers, $body);

        if ($res['status'] >= 400) {
            $errorData = json_decode($res['body'], true);
            $errorMsg = $errorData['error'] ?? $res['body'];
            if (is_array($errorMsg)) $errorMsg = json_encode($errorMsg);

            if (strpos($errorMsg, 'loading') !== false) {
                throw new Exception("HuggingFace Model is loading. Please wait.");
            }
            throw new Exception("HuggingFace Error ({$res['status']}): $errorMsg");
        }
        $data = json_decode($res['body'], true);
        return $this->extractJSON($data['choices'][0]['message']['content'] ?? '');
    }
}
