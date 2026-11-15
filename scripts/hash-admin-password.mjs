import { randomBytes, scryptSync } from "node:crypto";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

const password = input.replace(/(?:\r?\n)$/, "");
if (password.length < 8) {
  console.error("Admin passwords must be at least 8 characters.");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log(`$scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`);
}
