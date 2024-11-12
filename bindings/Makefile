../target/release/libjsonnet.so:
	cargo build --release -p libjsonnet

./c/libjsonnet_test_file: ./c/libjsonnet_test_file.c ../target/release/libjsonnet.so
	gcc -L../target/release/ -ljsonnet ./c/libjsonnet_test_file.c -o ./c/libjsonnet_test_file

.PHONY: test-c
test-c: ./c/libjsonnet_test_file ../target/release/libjsonnet.so
	export LD_LIBRARY_PATH=../target/release/
	ldd ./c/libjsonnet_test_file
	valgrind --leak-check=full ./c/libjsonnet_test_file test.jsonnet

../target/wasm32-wasi/debug/jsonnet.wasm:
	cd jsonnet && cargo wasi build -p libjsonnet --features interop && cd ..

test-js: ../target/wasm32-wasi/debug/jsonnet.wasm
	node --experimental-wasi-unstable-preview1 js/index
