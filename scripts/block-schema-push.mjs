console.error("Schema push is disabled: use reviewed additive SQL migrations. Production data must never be reset or destructively synchronized.");
process.exitCode = 1;
