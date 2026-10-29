<?php
/**
 * Clock and ID generation port.
 *
 * @package sw-sliderman
 */

declare(strict_types=1);

namespace SW\Slider\Application;

/**
 * Time and identity sources, replaceable in tests.
 */
interface SystemPorts {

	/** Current time as `Y-m-d H:i:s` in UTC. */
	public function now_gmt(): string;

	/** New random UUID v4. */
	public function uuid(): string;
}
