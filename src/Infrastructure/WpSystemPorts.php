<?php
/**
 * WordPress clock and UUID source.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Infrastructure;

use SW\Slider\Application\SystemPorts;

final class WpSystemPorts implements SystemPorts {

	public function now_gmt(): string {
		return gmdate( 'Y-m-d H:i:s' );
	}

	public function uuid(): string {
		return wp_generate_uuid4();
	}
}
