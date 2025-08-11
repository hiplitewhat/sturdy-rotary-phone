
// File: /api/redirect.js

export const config = {
  runtime: 'edge', // Important: use edge runtime for low-latency
};

export default async function handler(request) {
  const userAgent = request.headers.get("user-agent") || "";

  if (/axios/i.test(userAgent)) {
    return Response.redirect(
      "https://gist.githubusercontent.com/hiplitewhat/bb945bcae78f775c26be3897777d693d/raw/58a2a8ee6cc822bcbf749a233cb15cc6db81d0c3/gistfile1.txt",
      302
    );
  }

  return new Response("Access denied", { status: 403 });
}
