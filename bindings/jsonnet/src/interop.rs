//! Jrsonnet specific additional binding helpers

use std::{
	ffi::c_void,
	os::raw::{c_char, c_int},
};

use jrsonnet_evaluator::Val;

use crate::{import::jsonnet_import_callback, native::jsonnet_native_callback, VM};

extern "C" {
	pub fn _jrsonnet_static_import_callback(
		ctx: *mut c_void,
		base: *const c_char,
		rel: *const c_char,
		found_here: *mut *const c_char,
		success: &mut c_int,
	) -> *mut c_char;

	#[allow(improper_ctypes)]
	pub fn _jrsonnet_static_native_callback(
		ctx: *const c_void,
		argv: *const *const Val,
		success: *mut c_int,
	) -> *mut Val;
}

/// # Safety
#[no_mangle]
pub unsafe extern "C" fn jrsonnet_apply_static_import_callback(
	vm: &VM,
	ctx: *mut c_void
) {
	unsafe {
		jsonnet_import_callback(vm, _jrsonnet_static_import_callback, ctx)
	}
}

/// # Safety
#[no_mangle]
pub unsafe extern "C" fn jrsonnet_apply_static_native_callback(
	vm: &VM,
	name: *const c_char,
	ctx: *mut c_void,
	raw_params: *const *const c_char,
) {
	unsafe {
		jsonnet_native_callback(vm, name, _jrsonnet_static_native_callback, ctx, raw_params)
	}
}

// use crate::VM;

// #[no_mangle]
// use jrsonnet_evaluator::trace::JsFormat;
// pub extern "C" fn jrsonnet_set_trace_format(vm: &VM, format: u8) {
// 	match format {
// 		1 => vm.trace_format(Box::new(JsFormat { max_trace: 5 })),
// 		_ => panic!("unknown trace format"),
// 	}
// }
