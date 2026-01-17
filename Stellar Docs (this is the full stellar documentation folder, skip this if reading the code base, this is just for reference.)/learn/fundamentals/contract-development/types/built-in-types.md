# Built-In Types

Built-in types are available to all contracts for use as contract function inputs and outputs, and are defined by the [environment](/docs/learn/fundamentals/contract-development/environment-concepts.md) and the [Rust SDK](/docs/tools/sdks/contract-sdks.md).

> **Tip:** Custom types like structs, enums, and unions are also supported. See Custom Types.

## Primitive Types[](#primitive-types "Direct link to Primitive Types")

The following primitive types are supported:

### Unsigned 32-bit Integer (`u32`)[](#unsigned-32-bit-integer-u32 "Direct link to unsigned-32-bit-integer-u32")

### Signed 32-bit Integer (`i32`)[](#signed-32-bit-integer-i32 "Direct link to signed-32-bit-integer-i32")

### Unsigned 64-bit Integer (`u64`)[](#unsigned-64-bit-integer-u64 "Direct link to unsigned-64-bit-integer-u64")

### Signed 64-bit Integer (`i64`)[](#signed-64-bit-integer-i64 "Direct link to signed-64-bit-integer-i64")

### Unsigned 128-bit Integer (`u128`)[](#unsigned-128-bit-integer-u128 "Direct link to unsigned-128-bit-integer-u128")

### Signed 128-bit Integer (`i128`)[](#signed-128-bit-integer-i128 "Direct link to signed-128-bit-integer-i128")

### Bool (`bool`)[](#bool-bool "Direct link to bool-bool")

## Symbol (`Symbol`)[](#symbol-symbol "Direct link to symbol-symbol")

Symbols are small efficient strings up to 32 characters in length and limited to `a-z` `A-Z` `0-9` `_` that are encoded into 64-bit integers.

Symbols are primarily used for function names and other identifiers that are exported in the public API of a contract. They can also be used wherever short strings are needed to keep resource costs down.

## Bytes, Strings (`Bytes`, `BytesN`, `String`)[](#bytes-strings-bytes-bytesn-string "Direct link to bytes-strings-bytes-bytesn-string")

Byte arrays and strings can be passed to contracts and stores using the `Bytes` type.

For byte arrays of fixed length, `BytesN` can be used. For example, contract IDs are fixed 32-byte byte arrays, and are represented as `BytesN<32>`.

Note that the bytes contained in `String`s do not necessarily conform to any standard text encoding such as ASCII or Unicode UTF-8. They are plain uninterpreted bytes, and users expecting a particular encoding need to enforce that encoding manually.

## Vec (`Vec`)[](#vec-vec "Direct link to vec-vec")

Vec is a sequential and indexable growable collection type.

Values are stored in the environment and are available to contract through the functions defined on Vec. Values stored in the Vec are transmitted to the environment as RawVals, and when retrieved from the Vec are transmitted back and converted from RawVal back into their type.

The values in a Vec are not guaranteed to be of any specific type and conversion will fail if they are not of the expected type. Most functions on Vec return a Result due to this.

## Map (`Map`)[](#map-map "Direct link to map-map")

Map is a ordered key-value dictionary.

The map is ordered by its keys. Iterating a map is stable and always returns the keys and values in order of the keys.

The map is stored in the Host and available to the Guest through the functions defined on Map. Values stored in the Map are transmitted to the Host as RawVals, and when retrieved from the Map are transmitted back and converted from RawVal back into their type.

The keys and values in a Map are not guaranteed to be of type K/V and conversion will fail if they are not. Most functions on Map return a Result due to this.

Maps have at most one entry per key. Setting a value for a key in the map that already has a value for that key replaces the value.

## Address (`Address`)[](#address-address "Direct link to address-address")

Address is a universal opaque identifier to use in contracts. It may represent a 'classic' Stellar account, a custom account implemented in Soroban or just an arbitrary contract.

Address can be used as a contract function input argument (for example, to identify the payment recipient), as a data key (for example, to store the balance), as the authentication & authorization source (for example, to authorize a token transfer) etc.

See [authorization documentation](/docs/learn/fundamentals/contract-development/authorization.md) for more details on how to use the `Address` type.

## Option (`Option`)[](#option-option "Direct link to option-option")

Option represents an optional value.

The Option type is used for values that may, or may not, be present. The Option type is an enum and can either be `Some` (some value exists) or `None` (no value exits).

While Option acts like Rust's `Option<T>`, the Option type is not explicitly represented in XDR. The Option type is represented in the XDR by the `ScVal` `ScVoid` value when no value exists (None), any by any other `ScVal` value when the value exists (Some).