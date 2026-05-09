# Agent Instructions and Repository Guide / إرشادات الوكيل ودليل المستودع

This document provides essential information for AI agents and developers working on this repository.
يوفر هذا المستند معلومات أساسية للوكلاء البرمجيين والمطورين العاملين على هذا المستودع.

## Tech Stack / التقنيات المستخدمة

- **Frontend / الواجهة الأمامية**: Vanilla HTML5, CSS3, and JavaScript (ES6+).
- **Libraries / المكتبات**:
    - [SheetJS (XLSX)](https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js) for Excel/CSV export.
    - [Font Awesome 6.4.0](https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css) for icons.
    - Google Fonts: IBM Plex Sans Arabic & JetBrains Mono.
- **AI Connectivity / الاتصال بالذكاء الاصطناعي**: Direct client-side API integrations with multiple providers.

## Coding Conventions / قواعد البرمجة

1.  **RTL First / دعم العربية أولاً**: The application is designed for RTL (Right-to-Left) languages. Always ensure UI changes respect this layout.
    التطبيق مصمم للغات التي تُكتب من اليمين إلى اليسار (RTL). تأكد دائماً أن تغييرات واجهة المستخدم تحترم هذا التنسيق.
2.  **No Frameworks / بدون أطر عمل**: Maintain the codebase using vanilla JavaScript, HTML, and CSS. Do not add external frameworks (like React or Vue) unless explicitly requested.
    حافظ على الكود باستخدام JavaScript و HTML و CSS الأصلية. لا تضف أطر عمل خارجية إلا إذا طُلب ذلك صراحة.
3.  **Theming with CSS Variables / التنسيق باستخدام متغيرات CSS**: Use the variables defined in the `:root` of `style.css` for all colors and design constants.
    استخدم المتغيرات المعرفة في `:root` في ملف `style.css` لجميع الألوان وثوابت التصميم.
4.  **Global State / الحالة العامة**: Application state is managed via global variables in `script.js`. Keep this simple and documented.
    تتم إدارة حالة التطبيق عبر متغيرات عامة في ملف `script.js`. حافظ على بساطة هذا الأسلوب وتوثيقه.
5.  **Feedback Mechanisms / آليات التغذية الراجعة**:
    - Use `showNotification(title, msg, type)` for toast-style alerts.
    - Use `log(msg, type)` to output information to the internal console.
    - استخدم `showNotification` للتنبيهات السريعة.
    - استخدم `log` لإخراج المعلومات إلى وحدة التحكم الداخلية.

## Adding a New AI Provider / إضافة مزود ذكاء اصطناعي جديد

To add a new AI provider, follow these steps:
لإضافة مزود ذكاء اصطناعي جديد، اتبع الخطوات التالية:

1.  **HTML**:
    - Add a `<button class="prov-btn">` inside `#providerGrid`.
    - Create a `<div class="prov-panel" id="panel_[name]">` for the provider's specific settings.
    - أضف زر `<button>` داخل `#providerGrid`.
    - أنشئ لوحة إعدادات `<div class="prov-panel">` مخصصة للمزود.

2.  **State & Persistence (script.js) / الحالة والاستمرارية**:
    - If an API key is required, add it to `KEY_STORE` and `KEY_FIELDS`.
    - Update `saveConfig()` to include any new input fields.
    - إذا كان هناك مفتاح API مطلوب، أضفه إلى `KEY_STORE` و `KEY_FIELDS`.
    - حدث دالة `saveConfig()` لتشمل أي حقول إدخال جديدة.

3.  **Integration (script.js) / التكامل**:
    - Implement a new asynchronous function: `async function call[Name](b64, onProgress)`.
    - Add the new provider to the `switch` statement inside `callAI(b64, onProgress)`.
    - قم بتنفيذ دالة غير متزامنة جديدة: `async function call[Name](b64, onProgress)`.
    - أضف المزود الجديد إلى جملة `switch` داخل دالة `callAI`.

4.  **UI Updates**: Update `PROVIDER_NAMES` to include the display name of the new provider.
    حدث `PROVIDER_NAMES` ليشمل اسم العرض للمزود الجديد.
