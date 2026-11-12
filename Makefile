.DEFAULT_GOAL := build

NPM ?= npm
DEPS_STAMP := node_modules/.make-install

.PHONY: build check zip release
build: $(DEPS_STAMP)
	$(NPM) run build

$(DEPS_STAMP): package.json package-lock.json
	$(NPM) ci --include=dev
	touch "$@"

check: $(DEPS_STAMP)
	composer check
	$(NPM) run lint
	$(NPM) run typecheck
	$(NPM) test
	bash bin/i18n.sh check

zip:
	bash bin/build-zip.sh

# The version travels through the environment, never interpolated into shell code.
release: export SWS_RELEASE_VERSION = $(VERSION)
release:
	bash bin/release.sh
