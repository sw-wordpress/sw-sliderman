<?php
/** Minimal WordPress boundary for build-time artifact verification only. */
declare(strict_types=1);

// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedClassFound -- Exact WordPress test double.
final class WP_Error {
	public function __construct( public string $code, private string $message ) {}
	public function get_error_message(): string {
		return $this->message;
	}
}
// phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- Exact WordPress translation test double.
function __( string $message, string $domain ): string {
	return $message;
}
