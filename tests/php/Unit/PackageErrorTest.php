<?php
/**
 * Stable package error identity for callers and diagnostics.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Tests\Unit;

use PHPUnit\Framework\TestCase;
use SW\Slider\ImportExport\PackageError;

final class PackageErrorTest extends TestCase {
	public function test_machine_code_remains_separate_from_diagnostic_context(): void {
		$error = new PackageError( 'unsafe_path', '../outside.php' );
		$this->assertSame( 'unsafe_path', $error->error_code );
		$this->assertSame( '../outside.php', $error->detail );
		$this->assertSame( 'unsafe_path: ../outside.php', $error->getMessage() );
	}

	public function test_missing_diagnostic_context_keeps_the_machine_code_readable(): void {
		$error = new PackageError( 'invalid_package' );
		$this->assertSame( '', $error->detail );
		$this->assertSame( 'invalid_package', $error->getMessage() );
	}
}
