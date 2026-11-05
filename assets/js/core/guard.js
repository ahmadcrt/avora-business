// Page guard. This only decides what to SHOW. Real enforcement is Row Level Security in the database.

/**
 * Resolve to { session, profile } when the visitor is signed in with the required role.
 * Otherwise call redirect(url) and resolve to null.
 */
export async function requireRole(client, role, { redirect, loginUrl = 'login.html', next = 'dashboard.html' }) {
  let session = null;
  try { session = await client.getSession(); } catch { session = null; }
  if (!session || !session.user) {
    redirect(`${loginUrl}?next=${encodeURIComponent(next)}`);
    return null;
  }

  let profile;
  try {
    profile = await client.from('profiles').select('id,role,full_name,phone').eq('id', session.user.id).maybeSingle();
  } catch (err) {
    if (err && (err.status === 401 || err.status === 403)) {
      await client.auth.signOut();
      redirect(`${loginUrl}?reason=expired`);
      return null;
    }
    throw err;
  }

  if (!profile) {
    await client.auth.signOut();
    redirect(`${loginUrl}?reason=no-profile`);
    return null;
  }
  if (profile.role !== role) {
    redirect(`${loginUrl}?reason=role`);
    return null;
  }
  return { session, profile };
}
