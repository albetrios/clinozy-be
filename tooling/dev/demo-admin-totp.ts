/**
 * The TOTP secret of the local demo platform admin (A-2): `super_admin` needs an enrolled MFA
 * factor and an MFA-verified session, so the operator tools that sign in as that admin —
 * `pnpm tool:admin-token`, the dashboards Bull Board proxy, the nightly k6 admin scenarios — compute
 * a TOTP code from the same secret `pnpm db:seed:demo-admin` enrolls.
 *
 * `DEMO_TOTP_SECRET` overrides it (the nightly k6 job sets it in its env); unset, the local default
 * below applies — like the demo password, a known value for a local or test database only:
 * `db:seed:demo-admin` refuses a non-local database (H-11), so it can never enroll this anywhere
 * else.
 *
 * Plain TypeScript with erasable syntax only and no imports, so the `.mjs` dashboards proxy that
 * `node` runs directly imports it too (Node strips the types).
 */

/** Base32 of the phrase `demo-admin-totp-local-only` (26 bytes, above otplib's 16-byte floor). */
const DEMO_ADMIN_TOTP_SECRET_DEFAULT = 'MRSW23ZNMFSG22LOFV2G65DQFVWG6Y3BNQWW63TMPE'; // gitleaks:allow

/** The demo admin's TOTP secret: `DEMO_TOTP_SECRET` when set, else the local default. */
export function resolveDemoAdminTotpSecret(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const configured = environment.DEMO_TOTP_SECRET?.trim();
  return configured ? configured : DEMO_ADMIN_TOTP_SECRET_DEFAULT;
}
