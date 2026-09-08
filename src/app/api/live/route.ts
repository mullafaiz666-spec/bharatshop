export const dynamic = 'force-dynamic';
// Render process health check; business readiness is /api/health?deep=1.
export async function GET() { return Response.json({ status: 'alive', readinessVerified: false }, { headers: { 'Cache-Control': 'no-store' } }); }
