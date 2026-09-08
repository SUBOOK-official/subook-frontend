import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(appRoot, ".env.local");
if (existsSync(destination)) {
  console.log("모바일 .env.local이 이미 있습니다. 기존 설정을 유지합니다.");
  process.exit(0);
}

const variables = {};
for (const directory of [resolve(appRoot, "../../.."), resolve(appRoot, "../..")]) {
  for (const name of [".env", ".env.local"]) {
    const source = resolve(directory, name);
    if (existsSync(source)) Object.assign(variables, parseEnv(readFileSync(source, "utf8")));
  }
}
const url = variables.VITE_SUPABASE_PUBLIC_URL || variables.VITE_SUPABASE_URL;
const key = variables.VITE_SUPABASE_PUBLIC_PUBLISHABLE_KEY || variables.VITE_SUPABASE_PUBLIC_ANON_KEY || variables.VITE_SUPABASE_ANON_KEY;
let publicKey = key?.startsWith("sb_publishable_");
if (!publicKey && key) {
  try { publicKey = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon"; } catch { /* 비공개·잘못된 키 거부 */ }
}
if (!url?.startsWith("https://") || !publicKey) {
  console.error("기존 공개 Supabase 설정을 찾지 못했습니다. .env.example을 참고해 모바일 .env.local을 설정하세요.");
  process.exit(1);
}
writeFileSync(destination, `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`, { flag: "wx" });
console.log("기존 공개 설정 2개만 모바일 .env.local에 복사했습니다. 값은 출력하지 않았습니다.");
