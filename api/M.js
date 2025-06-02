
// File: /api/redirect.js

export const config = {
  runtime: 'edge', // Important: use edge runtime for low-latency
};

export default async function handler(request) {
  const userAgent = request.headers.get("user-agent") || "";

  if (/roblox/i.test(userAgent)) {
    return Response.redirect(
      "https://gist.githubusercontent.com/hiplitewhat/b6dd9a0c53e6dba52ea6eff294825d7b/raw/127c6b915a96bc7bd310a1fa01cdc43615229544/gistfile1.txt",
      302
    );
  }

  return new Response("Access denied", { status: 403 });
}
