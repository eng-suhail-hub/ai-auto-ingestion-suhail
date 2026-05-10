/**
 * Professional Image Optimization Module
 */
const ImageOptimizer = {
    /**
     * Resizes and compresses an image before upload.
     * @param {File} file - The original image file.
     * @param {number} maxWidth - Maximum width for the resized image.
     * @param {number} quality - JPEG quality (0 to 1).
     * @returns {Promise<string>} - Base64 data of optimized image.
     */
    async optimize(file, maxWidth = 1280, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = (maxWidth / width) * height;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Use JPEG for optimization unless it's a small PNG/WebP
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(dataUrl);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }
};

window.ImageOptimizer = ImageOptimizer;
