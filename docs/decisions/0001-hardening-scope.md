# 0001 - Hardening scope and approach

Context: playbook-based hardening of the existing JSON-file backend. Owner wants no new features.

Decision:
- Keep JSON file store and plain-JS stack. No new dependencies (node:test for tests, hand-written security headers and body-size limits).
- Server computes booking price; browser value is ignored.
- Public input is sanitised on the server (angle brackets removed) AND admin renderers escape output (defence in depth).
- Production start refuses weak/missing JWT_SECRET; development only warns.
- Low-severity items stay listed as TODO in docs/audit.md.

Consequences: Razorpay/SQLite checks are out of scope because that code is not in this repo.
