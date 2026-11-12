<?php
declare(strict_types=1);
/** Release tooling regressions using disposable repositories and a simulated GitHub CLI. */

abstract class SWS_Release_TestCase extends \PHPUnit\Framework\TestCase {
    protected function workflow_step(string $name): string {
        $workflow = file_get_contents(SWS_DIR . '.github/workflows/main.yml');
        self::assertSame(1, preg_match('/      - name: ' . preg_quote($name, '/') . '\n.*?        run: \|\n(.*?)(?=\n      - name:|\z)/s', $workflow, $match));
        return preg_replace('/^          /m', '', $match[1]);
    }

    protected function execute(array $command, ?string $cwd = null, ?array $env = null): array {
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $cwd, $env);
        self::assertIsResource($process);
        $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        return [proc_close($process), $output];
    }

    protected function remove_tree(string $root): void {
        if (!is_dir($root)) return;
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($files as $file) {
            if ($file->isDir() && !$file->isLink()) rmdir($file->getPathname());
            else unlink($file->getPathname());
        }
        rmdir($root);
    }
}

final class ReleaseWorkflowTest extends SWS_Release_TestCase
{
    public static function releaseStates(): array
    {
        return [
            'new draft' => ['missing', 0],
            'existing draft' => ['draft', 0],
            'published release' => ['published', 1],
            'metadata request fails' => ['api-error', 1],
        ];
    }

    /** @dataProvider releaseStates */
    public function testUploadResolvesDraftMetadataAfterUpload(string $state, int $expectedExit): void
    {
        $workflow = file_get_contents(rtrim(SWS_DIR, '/') . '/.github/workflows/main.yml');
        self::assertIsString($workflow);
        self::assertSame(1, preg_match('/      - name: Upload packages to draft release\n.*?        run: \|\n(.*?)(?=\n      - name:)/s', $workflow, $match));
        $script = preg_replace('/^          /m', '', $match[1]);
        self::assertIsString($script);
        $root = sys_get_temp_dir() . '/sws-release-workflow-' . bin2hex(random_bytes(6));
        mkdir($root . '/dist', 0700, true);
        try {
            file_put_contents($root . '/dist/sw-sliderman-0.8.0.zip', 'disposable test package');
            file_put_contents($root . '/gh', <<<'BASH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$RUNNER_TEMP/commands"
case "$*" in
  'release view 0.8.0 --json isDraft')
    case "$TEST_RELEASE_STATE" in
      missing) exit 1 ;;
      published) printf '{"isDraft":false}' ;;
      *) printf '{"isDraft":true}' ;;
    esac ;;
  'release create 0.8.0 --draft --verify-tag --title 0.8.0')
    test "$TEST_RELEASE_STATE" = missing ;;
  "release upload 0.8.0 $RUNNER_TEMP/dist/sw-sliderman-0.8.0.zip --clobber")
    touch "$RUNNER_TEMP/uploaded" ;;
  'release view 0.8.0 --json apiUrl --jq .apiUrl')
    test -f "$RUNNER_TEMP/uploaded"
    printf 'https://api.github.com/repos/sw-wordpress/sw-sliderman/releases/42\n' ;;
  'api https://api.github.com/repos/sw-wordpress/sw-sliderman/releases/42')
    test -f "$RUNNER_TEMP/uploaded"
    if [ "$TEST_RELEASE_STATE" = api-error ]; then exit 1; fi
    printf '{"id":42,"draft":true,"assets":[{"id":56,"name":"sw-sliderman-0.8.0.zip"}]}' ;;
  *) printf 'Unexpected GitHub request: %s\n' "$*" >&2; exit 1 ;;
esac
BASH
            );
            chmod($root . '/gh', 0700);
            $process = proc_open(['bash', '-e', '-o', 'pipefail', '-c', $script], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, [
                'PATH' => $root . ':' . getenv('PATH'),
                'RUNNER_TEMP' => $root,
                'RELEASE_TAG' => '0.8.0',
                'GITHUB_REPOSITORY' => 'sw-wordpress/sw-sliderman',
                'TEST_RELEASE_STATE' => $state,
            ]);
            self::assertIsResource($process);
            $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame($expectedExit, proc_close($process), $output);
            if ($expectedExit === 0) {
                $release = json_decode(file_get_contents($root . '/release.json'), true, 32, JSON_THROW_ON_ERROR);
                self::assertSame(42, $release['id']);
                self::assertSame(56, $release['assets'][0]['id']);
            }
            if ($state === 'published') {
                self::assertFileDoesNotExist($root . '/uploaded');
                self::assertFileDoesNotExist($root . '/release.json');
                self::assertStringContainsString('already published', $output);
            }
        } finally {
            $this->remove_tree($root);
        }
    }
}

final class ReleaseSigningKeyTest extends SWS_Release_TestCase {
    public static function key_states(): array {
        return ['new key' => ['new', 0], 'same key' => ['same', 0], 'conflicting key' => ['conflict', 1], 'missing secret' => ['missing', 1]];
    }

    /** @dataProvider key_states */
    public function test_public_key_export_preserves_trust(string $state, int $expected): void {
        $root = sys_get_temp_dir() . '/sws-key-test-' . bin2hex(random_bytes(6));
        mkdir($root, 0700);
        $pair = sodium_crypto_sign_keypair();
        $secret = base64_encode(sodium_crypto_sign_secretkey($pair));
        $public = base64_encode(sodium_crypto_sign_publickey($pair));
        $historical = base64_encode(sodium_crypto_sign_publickey(sodium_crypto_sign_keypair()));
        $keys = ['historical' => $historical];
        if ($state === 'same') $keys['build'] = $public;
        if ($state === 'conflict') $keys['build'] = $historical;
        $file = $root . '/keys.php';
        $before = '<?php return ' . var_export($keys, true) . ';';
        file_put_contents($file, $before);
        try {
            [$exit, $output] = $this->execute([PHP_BINARY, SWS_DIR . 'bin/release-manifest.php', 'public-key', $file], null, [
                'SW_PLUGIN_RELEASE_SIGNING_KEY' => $state === 'missing' ? '' : $secret,
                'SW_PLUGIN_RELEASE_KEY_ID' => 'build',
            ]);
            self::assertSame($expected, $exit, $output);
            self::assertStringNotContainsString($secret, $output);
            if ($expected !== 0) {
                self::assertSame($before, file_get_contents($file));
            } else {
                $actual = require $file;
                self::assertStringContainsString("declare(strict_types=1);", file_get_contents($file));
                self::assertSame(['historical' => $historical, 'build' => $public], $actual);
            }
        } finally {
            $this->remove_tree($root);
        }
    }

    public static function tags(): array {
        return ['plain' => ['1.4.0.8', 0], 'prefixed build' => ['v1.4.0.8-01', 0], 'prerelease' => ['1.4.0.8-rc1', 1], 'five parts' => ['1.4.0.8.1', 1], 'arbitrary build' => ['1.4.0.8-001', 1]];
    }

    /** @dataProvider tags */
    public function test_workflow_rejects_tags_the_runtime_cannot_verify(string $tag, int $expected): void {
        $root = sys_get_temp_dir() . '/sws-release-tag-' . bin2hex(random_bytes(6));
        mkdir($root, 0700);
        try {
            [$exit, $output] = $this->execute(['bash', '-e', '-o', 'pipefail', '-c', $this->workflow_step('Determine version')], $root, [
                'PATH' => getenv('PATH'), 'GITHUB_REF_NAME' => $tag, 'GITHUB_OUTPUT' => $root . '/output',
            ]);
            self::assertSame($expected, $exit, $output);
            if ($expected === 0) self::assertSame("version=1.4.0.8\n", file_get_contents($root . '/output'));
            else self::assertFileDoesNotExist($root . '/output');
        } finally {
            $this->remove_tree($root);
        }
    }
}

final class ReleaseOperationsDocumentationTest extends SWS_Release_TestCase {
    public function test_copy_paste_blocks_in_isolation_with_disposable_keys_and_mocked_github(): void {
        $root = sys_get_temp_dir() . '/sws-operations-' . bin2hex(random_bytes(6));
        mkdir($root . '/plugin/includes/update', 0700, true);
        mkdir($root . '/mock-bin', 0700);
        try {
            $historical = base64_encode(random_bytes(32));
            $target = $root . '/plugin/includes/update/trusted-keys.php';
            file_put_contents($target, '<?php return ' . var_export(['historical' => $historical], true) . ';');
            $document = file_get_contents(SWS_DIR . 'docs/GITHUB-UPDATES-BETRIEB.md');
            preg_match_all('/```bash\n(.*?)\n```/s', $document, $blocks);
            self::assertCount(3, $blocks[1]);
            $scripts = array_map(static fn($script) => str_replace(
                ['$HOME/.local/share/sw-sliderman-release-keys', '/var/www/html/wordpress_dev/wp-content/plugins/sw-sliderman'],
                [$root . '/keys', $root . '/plugin'], $script), $blocks[1]);
            [$exit, $output] = $this->execute(['bash', '-c', $scripts[0]]);
            self::assertSame(0, $exit, $output);
            self::assertSame(0700, fileperms($root . '/keys') & 0777);
            foreach (glob($root . '/keys/*') as $file) self::assertSame(0600, fileperms($file) & 0777);
            $secret = trim(file_get_contents($root . '/keys/signing-key.base64'));
            self::assertSame(64, strlen(base64_decode($secret, true)));
            self::assertStringNotContainsString($secret, $output);
            self::assertNotSame(0, $this->execute(['bash', '-c', $scripts[0]])[0]);
            // Stub only git diff and GitHub; no real repository/account mutation is permitted.
            file_put_contents($root . '/mock-bin/git', "#!/bin/sh\nexit 0\n");
            file_put_contents($root . '/mock-bin/gh', <<<'BASH'
#!/usr/bin/env bash
set -eu
case "$*" in
  'auth status'|'secret list --repo sw-wordpress/sw-sliderman --env plugin-releases'|'variable list --repo sw-wordpress/sw-sliderman --env plugin-releases') exit 0 ;;
  'secret set SW_PLUGIN_RELEASE_SIGNING_KEY --repo sw-wordpress/sw-sliderman --env plugin-releases')
    IFS= read -r value
    test "${#value}" -eq 88
    printf '%s' "$value" | sha256sum > "$SWS_MOCK_ROOT/submitted.sha256" ;;
  'variable set SW_PLUGIN_RELEASE_KEY_ID --repo sw-wordpress/sw-sliderman --env plugin-releases --body sw-sliderman-2026-11') exit 0 ;;
  *) exit 71 ;;
esac
BASH
            );
            chmod($root . '/mock-bin/git', 0700); chmod($root . '/mock-bin/gh', 0700);
            $environment = ['PATH' => $root . '/mock-bin:' . getenv('PATH'), 'SWS_MOCK_ROOT' => $root];
            [$exit, $output] = $this->execute(['bash', '-c', $scripts[1]], null, $environment);
            self::assertSame(0, $exit, $output);
            $keys = require $target;
            self::assertStringContainsString("declare(strict_types=1);", file_get_contents($target));
            self::assertSame($historical, $keys['historical']);
            self::assertSame(32, strlen(base64_decode($keys['sw-sliderman-2026-11'], true)));
            self::assertStringNotContainsString($secret, file_get_contents($target));
            self::assertSame(0, $this->execute(['bash', '-c', $scripts[1]], null, $environment)[0]);
            [$exit, $output] = $this->execute(['zsh', '-c', $scripts[2]], null, $environment);
            self::assertSame(0, $exit, $output);
            self::assertStringNotContainsString($secret, $output);
            self::assertStringStartsWith(hash('sha256', $secret), file_get_contents($root . '/submitted.sha256'));
            $before = file_get_contents($target);
            file_put_contents($root . '/keys/public-keys.php', '<?php return ' . var_export(['sw-sliderman-2026-11' => $historical], true) . ';');
            self::assertNotSame(0, $this->execute(['zsh', '-c', $scripts[1]], null, $environment)[0]);
            self::assertSame($before, file_get_contents($target));
        } finally { $this->remove_tree($root); }
    }
}
