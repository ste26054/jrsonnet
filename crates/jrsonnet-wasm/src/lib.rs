use std::{cell::RefCell, collections::HashMap, rc::Rc};

use jrsonnet_evaluator::{
	error::ErrorKind,
	manifest::{JsonFormat, ManifestFormat},
	trace::PathResolver,
	AsPathLike, ImportResolver, ResolvePathOwned, ResolvePath, State, Val,
};
use jrsonnet_gcmodule::Acyclic;
use jrsonnet_parser::{SourcePath, SourcePathT};
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// WasmSourceFile — custom SourcePath type for virtual files in WASM
// ---------------------------------------------------------------------------

#[derive(Acyclic, Hash, PartialEq, Eq, Debug, Clone)]
struct WasmSourceFile(String);

impl std::fmt::Display for WasmSourceFile {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "{}", self.0)
	}
}

impl SourcePathT for WasmSourceFile {
	fn is_default(&self) -> bool {
		false
	}
	fn path(&self) -> Option<&std::path::Path> {
		None
	}
	fn as_any(&self) -> &dyn std::any::Any {
		self
	}
	fn dyn_hash(&self, mut hasher: &mut dyn std::hash::Hasher) {
		use std::hash::Hash;
		self.hash(&mut hasher);
	}
	fn dyn_eq(&self, other: &dyn SourcePathT) -> bool {
		other
			.as_any()
			.downcast_ref::<Self>()
			.is_some_and(|o| o == self)
	}
	fn dyn_debug(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		std::fmt::Debug::fmt(self, fmt)
	}
}

// ---------------------------------------------------------------------------
// Shared import state — held by both the resolver and the Jrsonnet struct
// ---------------------------------------------------------------------------

type FileMap = Rc<RefCell<HashMap<String, String>>>;
type Callback = Rc<RefCell<Option<js_sys::Function>>>;

// ---------------------------------------------------------------------------
// WasmImportResolver
// ---------------------------------------------------------------------------

#[derive(Acyclic)]
struct WasmImportResolver {
	files: FileMap,
	callback: Callback,
}

fn path_like_to_string(path: &dyn AsPathLike) -> String {
	match path.as_path() {
		ResolvePath::Str(s) => s.to_string(),
		ResolvePath::Path(p) => p.to_string_lossy().into_owned(),
	}
}

impl ImportResolver for WasmImportResolver {
	fn resolve_from(
		&self,
		_from: &SourcePath,
		path: &dyn AsPathLike,
	) -> jrsonnet_evaluator::error::Result<SourcePath> {
		let path_str = path_like_to_string(path);

		// Virtual files are always resolvable.
		if self.files.borrow().contains_key(&path_str) {
			return Ok(SourcePath::new(WasmSourceFile(path_str)));
		}

		// If callback is set, assume it can resolve anything — actual errors
		// will surface at load time.
		if self.callback.borrow().is_some() {
			return Ok(SourcePath::new(WasmSourceFile(path_str)));
		}

		Err(ErrorKind::ImportFileNotFound(
			SourcePath::default(),
			ResolvePathOwned::Str(path_str),
		)
		.into())
	}

	fn load_file_contents(
		&self,
		resolved: &SourcePath,
	) -> jrsonnet_evaluator::error::Result<Vec<u8>> {
		let wasm_path = resolved
			.downcast_ref::<WasmSourceFile>()
			.expect("WasmImportResolver only produces WasmSourceFile paths");
		let path_str = &wasm_path.0;

		// Check virtual files first.
		if let Some(contents) = self.files.borrow().get(path_str) {
			return Ok(contents.as_bytes().to_vec());
		}

		// Try the synchronous JS callback.
		if let Some(callback) = self.callback.borrow().as_ref() {
			let this = JsValue::NULL;
			let path_js = JsValue::from_str(path_str);
			match callback.call1(&this, &path_js) {
				Ok(result) => {
					if let Some(s) = result.as_string() {
						return Ok(s.into_bytes());
					}
					// null/undefined → not found
				}
				Err(e) => {
					let msg = e
						.as_string()
						.unwrap_or_else(|| "JS import callback error".to_string());
					return Err(ErrorKind::ImportCallbackError(msg).into());
				}
			}
		}

		Err(ErrorKind::ResolvedFileNotFound(resolved.clone()).into())
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn manifest_json(val: &Val) -> jrsonnet_evaluator::error::Result<String> {
	JsonFormat::std_to_json("    ".to_owned(), "\n", ": ").manifest(val.clone())
}

fn format_error(e: &jrsonnet_evaluator::Error) -> String {
	format!("{e}")
}

// ---------------------------------------------------------------------------
// Jrsonnet — main WASM-exposed struct
// ---------------------------------------------------------------------------

/// jrsonnet WebAssembly interface.
#[wasm_bindgen]
pub struct Jrsonnet {
	state: State,
	files: FileMap,
	callback: Callback,
	context_initializer: jrsonnet_stdlib::ContextInitializer,
}

#[wasm_bindgen]
impl Jrsonnet {
	/// Create a new Jrsonnet instance with the full standard library.
	#[wasm_bindgen(constructor)]
	pub fn new() -> Self {
		setup_panic_hook();

		let files: FileMap = Rc::new(RefCell::new(HashMap::new()));
		let callback: Callback = Rc::new(RefCell::new(None));

		let resolver = WasmImportResolver {
			files: files.clone(),
			callback: callback.clone(),
		};

		let context_initializer =
			jrsonnet_stdlib::ContextInitializer::new(PathResolver::FileName);

		let mut builder = State::builder();
		builder.import_resolver(resolver);
		builder.context_initializer(context_initializer.clone());
		let state = builder.build();

		Self {
			state,
			files,
			callback,
			context_initializer,
		}
	}

	/// Register a virtual file for imports.
	pub fn add_file(&self, path: &str, contents: &str) {
		self.files
			.borrow_mut()
			.insert(path.to_string(), contents.to_string());
	}

	/// Remove a previously registered virtual file.
	pub fn remove_file(&self, path: &str) {
		self.files.borrow_mut().remove(path);
	}

	/// Set a synchronous import callback.
	///
	/// Signature: `(path: string) => string | null`
	///
	/// Return the file contents as a string, or `null` if the file is not found.
	/// This is called when an import cannot be resolved from virtual files.
	pub fn set_import_callback(&self, callback: js_sys::Function) {
		*self.callback.borrow_mut() = Some(callback);
	}

	/// Clear the import callback.
	pub fn clear_import_callback(&self) {
		*self.callback.borrow_mut() = None;
	}

	/// Set an external variable (string value).
	/// Accessible in Jsonnet as `std.extVar("key")`.
	pub fn ext_var(&self, key: &str, value: &str) {
		self.context_initializer
			.add_ext_str(key.into(), value.into());
	}

	/// Set an external variable (Jsonnet code).
	/// The code is evaluated when `std.extVar("key")` is called.
	pub fn ext_code(&self, key: &str, code: &str) -> Result<(), JsValue> {
		self.context_initializer
			.add_ext_code(key, code)
			.map_err(|e| JsValue::from_str(&format_error(&e)))
	}

	/// Evaluate a Jsonnet snippet and return the JSON output.
	///
	/// All imports must be resolvable via:
	/// 1. Virtual files registered with `add_file()`
	/// 2. The synchronous import callback set with `set_import_callback()`
	pub fn evaluate_snippet(&self, filename: &str, code: &str) -> Result<String, JsValue> {
		let _guard = self.state.enter();
		let val = self
			.state
			.evaluate_snippet(filename, code)
			.map_err(|e| JsValue::from_str(&format_error(&e)))?;

		manifest_json(&val).map_err(|e| JsValue::from_str(&format_error(&e)))
	}
}

// ---------------------------------------------------------------------------
// Top-level functions
// ---------------------------------------------------------------------------

/// Get the jrsonnet version string.
#[wasm_bindgen]
pub fn version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}

fn setup_panic_hook() {
	use std::sync::Once;
	static SET_HOOK: Once = Once::new();
	SET_HOOK.call_once(|| {
		std::panic::set_hook(Box::new(|info| {
			web_sys::console::error_1(&JsValue::from_str(&format!("jrsonnet panic: {info}")));
		}));
	});
}
