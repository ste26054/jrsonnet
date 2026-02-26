WASM_CRATE    := crates/jrsonnet-wasm
WASM_PKG      := $(WASM_CRATE)/pkg
WASM_BINARY   := $(WASM_PKG)/jrsonnet_wasm_bg.wasm

RUSTFLAGS_WASM := --cfg web_sys_unstable_apis -C target-feature=+bulk-memory

.PHONY: build build-wasm optimize-wasm profile clean test-wasm

## Build WASM binary with wasm-pack, then optimize with wasm-opt
build: build-wasm optimize-wasm

## Build WASM binary (unoptimized) via wasm-pack
build-wasm:
	RUSTFLAGS='$(RUSTFLAGS_WASM)' wasm-pack build $(WASM_CRATE) --target web

## Run wasm-opt on the built binary
optimize-wasm: $(WASM_BINARY)
	@echo "Before wasm-opt: $$(wc -c < $(WASM_BINARY)) bytes"
	wasm-opt -O4 \
		--enable-bulk-memory \
		--enable-mutable-globals \
		--enable-sign-ext \
		--enable-nontrapping-float-to-int \
		--duplicate-function-elimination \
		--merge-similar-functions \
		$(WASM_BINARY) -o $(WASM_BINARY)
	@echo "After wasm-opt:  $$(wc -c < $(WASM_BINARY)) bytes"

## Run twiggy to profile binary size contributors
profile: $(WASM_BINARY)
	twiggy top -n 20 $(WASM_BINARY)

## Run WASM test suite (requires built WASM)
test-wasm: build-wasm
	cd playground && npx playwright test tests/wasm-suite.spec.js

## Clean build artifacts
clean:
	rm -rf $(WASM_PKG)
