import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: {
    type: "spki",
    format: "der",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

const rawPublicKey = publicKey.subarray(-65);

if (rawPublicKey[0] !== 0x04) {
  throw new Error("Could not extract raw P-256 public key.");
}

console.log("WEB_PUSH_VAPID_PUBLIC_KEY=");
console.log(base64Url(rawPublicKey));
console.log("");
console.log("WEB_PUSH_VAPID_PRIVATE_KEY=");
console.log(privateKey.trim());
console.log("");
console.log("WEB_PUSH_VAPID_SUBJECT=");
console.log("mailto:admin@example.com");

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
