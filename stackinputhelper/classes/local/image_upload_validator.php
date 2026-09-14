<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * classes local image upload validator.php for STACK Input Helper.
 *
 * @package    local_stackinputhelper
 * @copyright  2026 Phoebe Huang
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
namespace local_stackinputhelper\local;

defined('MOODLE_INTERNAL') || die();

/**
 * Validates uploaded images before they are sent to the recognition service.
 */
final class image_upload_validator {
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    /** Maximum width or height accepted from a camera or screenshot. */
    private const MAX_DIMENSION = 8192;

    /** Maximum decoded pixel count, independent of the compressed file size. */
    private const MAX_PIXELS = 20000000;

    /**
     * Validate a PHP upload and return trusted metadata.
     *
     * @param array $file One entry from the $_FILES array.
     * @return array Trusted filepath, filename, MIME type, size and dimensions.
     */
    public static function validate(array $file): array {
        self::validate_upload_error($file);

        $filepath = $file['tmp_name'] ?? '';
        if (!is_string($filepath) || $filepath === '' || !is_uploaded_file($filepath)) {
            throw new \moodle_exception('invaliduploadedfile', 'local_stackinputhelper');
        }

        $configuredmb = max(1, (int)get_config('local_stackinputhelper', 'maxfilesize'));
        $metadata = self::inspect_image($filepath, $configuredmb * 1024 * 1024);
        $metadata['filepath'] = $filepath;
        $metadata['filename'] = 'stack-input.' . self::ALLOWED_MIME_TYPES[$metadata['mimetype']];

        return $metadata;
    }

    /**
     * Inspect image contents without relying on browser-provided metadata.
     *
     * This method is public so the content validation can be unit tested without
     * manufacturing a PHP HTTP upload.
     *
     * @param string $filepath Path to a readable candidate image.
     * @param int $maxbytes Maximum allowed compressed file size.
     * @return array Trusted MIME type, size and dimensions.
     */
    public static function inspect_image(string $filepath, int $maxbytes): array {
        if (!is_readable($filepath) || !is_file($filepath)) {
            throw new \moodle_exception('invaliduploadedfile', 'local_stackinputhelper');
        }

        $filesize = filesize($filepath);
        if ($filesize === false) {
            throw new \moodle_exception('invaliduploadedfile', 'local_stackinputhelper');
        }
        if ($filesize === 0) {
            throw new \moodle_exception('emptyuploadedfile', 'local_stackinputhelper');
        }
        if ($maxbytes < 1 || $filesize > $maxbytes) {
            throw new \moodle_exception('filetoolarge', 'local_stackinputhelper');
        }

        if (!class_exists('\finfo')) {
            throw new \moodle_exception('imagevalidationunavailable', 'local_stackinputhelper');
        }
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mimetype = $finfo->file($filepath);
        if (!is_string($mimetype) || !array_key_exists($mimetype, self::ALLOWED_MIME_TYPES)) {
            throw new \moodle_exception('invalidfiletype', 'local_stackinputhelper');
        }

        $imageinfo = @getimagesize($filepath);
        if ($imageinfo === false || empty($imageinfo[0]) || empty($imageinfo[1])) {
            throw new \moodle_exception('invalidimagecontents', 'local_stackinputhelper');
        }

        $headermime = $imageinfo['mime'] ?? '';
        if ($headermime !== $mimetype) {
            throw new \moodle_exception('invalidimagecontents', 'local_stackinputhelper');
        }

        $width = (int)$imageinfo[0];
        $height = (int)$imageinfo[1];
        if ($width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION
                || $width * $height > self::MAX_PIXELS) {
            throw new \moodle_exception('imagedimensionstoolarge', 'local_stackinputhelper');
        }

        if (!function_exists('imagecreatefromstring')) {
            throw new \moodle_exception('imagevalidationunavailable', 'local_stackinputhelper');
        }
        if (!self::decoder_supports($mimetype)) {
            throw new \moodle_exception('unsupportedserverimageformat', 'local_stackinputhelper');
        }
        $contents = file_get_contents($filepath);
        $image = $contents === false ? false : @imagecreatefromstring($contents);
        if ($image === false) {
            throw new \moodle_exception('invalidimagecontents', 'local_stackinputhelper');
        }
        // GdImage objects are released automatically on PHP 8+. The explicit
        // cleanup is retained only for Moodle installations still using PHP 7.
        if (PHP_VERSION_ID < 80000) {
            imagedestroy($image);
        }

        return [
            'mimetype' => $mimetype,
            'size' => (int)$filesize,
            'width' => $width,
            'height' => $height,
        ];
    }

    /**
     * Check that this PHP-GD build can decode the detected format.
     *
     * @param string $mimetype Trusted image MIME type.
     * @return bool Whether the corresponding GD decoder is available.
     */
    private static function decoder_supports(string $mimetype): bool {
        if (!function_exists('gd_info')) {
            return false;
        }
        $gdinfo = gd_info();
        $capability = [
            'image/jpeg' => 'JPEG Support',
            'image/png' => 'PNG Support',
            'image/webp' => 'WebP Support',
        ][$mimetype];

        return !empty($gdinfo[$capability]);
    }

    /**
     * Reject missing, partial and server-rejected uploads.
     *
     * @param array $file One entry from the $_FILES array.
     */
    private static function validate_upload_error(array $file): void {
        if (!array_key_exists('error', $file) || !is_int($file['error'])) {
            throw new \moodle_exception('invaliduploadedfile', 'local_stackinputhelper');
        }

        if ($file['error'] === UPLOAD_ERR_OK) {
            return;
        }
        if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
            throw new \moodle_exception('filetoolarge', 'local_stackinputhelper');
        }

        throw new \moodle_exception('invaliduploadedfile', 'local_stackinputhelper');
    }
}
