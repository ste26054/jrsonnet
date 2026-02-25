{
  // Deep merge two objects recursively.
  deepMerge(base, override)::
    local keys = std.set(std.objectFields(base) + std.objectFields(override));
    { [k]:
      if !std.objectHas(base, k) then override[k]
      else if !std.objectHas(override, k) then base[k]
      else if std.isObject(base[k]) && std.isObject(override[k])
      then $.deepMerge(base[k], override[k])
      else override[k]
      for k in keys },

  // Capitalize the first letter of a string.
  capitalize(s)::
    if std.length(s) == 0 then ""
    else std.asciiUpper(s[0]) + s[1:],

  // Join an array of strings with a separator.
  joinWith(arr, sep)::
    std.join(sep, arr),

  // Remove null values from an object.
  compact(obj)::
    { [k]: obj[k] for k in std.objectFields(obj) if obj[k] != null },

  // Create a lookup table from an array, keyed by a field.
  keyBy(arr, field)::
    { [item[field]]: item for item in arr },

  // Apply a template string, replacing {key} with values from vars.
  template(str, vars)::
    std.foldl(
      function(acc, key) std.strReplace(acc, "{" + key + "}", std.toString(vars[key])),
      std.objectFields(vars),
      str,
    ),
}
