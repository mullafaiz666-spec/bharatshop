// Fail closed: this legacy entry point used to force production schema changes.
console.error("Automatic schema push is disabled. Apply a separately reviewed additive migration.");
process.exit(2);
