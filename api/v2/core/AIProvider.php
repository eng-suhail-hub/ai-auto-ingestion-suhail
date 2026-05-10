<?php
namespace Suhail\Core;

use Exception;

abstract class AIProvider {
    protected $apiKey;
    protected $model;

    public function __construct($apiKey, $model) {
        $this->apiKey = $apiKey;
        $this->model = $model;
    }

    abstract public function process($prompt, $structure, $imagePath);

    protected function curlPost($url, $headers, $body) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($body) ? json_encode($body) : $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 90);
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

    protected function extractJSON($text) {
        if (empty($text)) return null;
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $matches)) {
            $text = $matches[1];
        }
        $firstBrace = strpos($text, '{');
        $firstBracket = strpos($text, '[');
        $start = false;
        $endChar = '';
        if ($firstBrace !== false && ($firstBracket === false || $firstBrace < $firstBracket)) {
            $start = $firstBrace; $endChar = '}';
        } elseif ($firstBracket !== false) {
            $start = $firstBracket; $endChar = ']';
        }
        if ($start !== false) {
            $end = strrpos($text, $endChar);
            if ($end !== false && $end > $start) {
                $jsonStr = substr($text, $start, $end - $start + 1);
                $decoded = json_decode($jsonStr, true);
                if ($decoded !== null) return $decoded;
            }
        }
        return json_decode(trim($text), true);
    }

    protected function getBase64Image($path) {
        $data = file_get_contents($path);
        $type = pathinfo($path, PATHINFO_EXTENSION);
        return 'data:image/' . $type . ';base64,' . base64_encode($data);
    }
}
