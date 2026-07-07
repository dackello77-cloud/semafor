import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PushToken = {
  token: string;
  platform: "android" | "ios" | string;
};

type PushPayload = {
  phoneLast7: string;
  title: string;
  body: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await request.json()) as PushPayload;
    const phoneLast7 = String(payload.phoneLast7 || "").replace(/\D/g, "").slice(-7);

    if (!phoneLast7 || !payload.title || !payload.body) {
      return json({ error: "phoneLast7, title, and body are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data, error } = await supabase
      .from("semafor_push_tokens")
      .select("token, platform")
      .eq("phone_last7", phoneLast7);

    if (error) throw error;

    const tokens = (data || []) as PushToken[];
    const results = await Promise.allSettled(
      tokens.map((token) => sendPush(token, payload.title, payload.body)),
    );

    return json({
      sent: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function sendPush(token: PushToken, title: string, body: string) {
  if (token.platform === "android") {
    return sendFcm(token.token, title, body);
  }

  if (token.platform === "ios") {
    return sendApns(token.token, title, body);
  }
}

async function sendFcm(token: string, title: string, body: string) {
  const serviceAccount = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") || "{}");
  const projectId = serviceAccount.project_id || Deno.env.get("FCM_PROJECT_ID");

  if (!serviceAccount.client_email || !serviceAccount.private_key || !projectId) {
    throw new Error("Missing FCM_SERVICE_ACCOUNT_JSON or FCM_PROJECT_ID");
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "semafor_customer",
            sound: "default",
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM failed: ${response.status} ${await response.text()}`);
  }
}

async function getGoogleAccessToken(serviceAccount: Record<string, string>) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      alg: "RS256",
      typ: "JWT",
    },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
    "RSASSA-PKCS1-v1_5",
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function sendApns(token: string, title: string, body: string) {
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") || "com.semafor.customer";
  const useSandbox = (Deno.env.get("APNS_USE_SANDBOX") || "true") === "true";

  if (!teamId || !keyId || !privateKey) {
    throw new Error("Missing APNS_TEAM_ID, APNS_KEY_ID, or APNS_PRIVATE_KEY");
  }

  const jwt = await signJwt(
    { alg: "ES256", kid: keyId },
    { iss: teamId, iat: Math.floor(Date.now() / 1000) },
    privateKey,
    "ECDSA",
  );
  const host = useSandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`APNs failed: ${response.status} ${await response.text()}`);
  }
}

async function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  pem: string,
  algorithmName: "RSASSA-PKCS1-v1_5" | "ECDSA",
) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const keyData = pemToArrayBuffer(pem);
  const algorithm =
    algorithmName === "ECDSA"
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const key = await crypto.subtle.importKey("pkcs8", keyData, algorithm, false, ["sign"]);
  const signature = await crypto.subtle.sign(
    algorithmName === "ECDSA" ? { name: "ECDSA", hash: "SHA-256" } : algorithm,
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function pemToArrayBuffer(pem: string) {
  const clean = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
